import { db } from "../../config/database";
import { syncRunEntries } from "@dragons/db/schema";
import type { NewSyncRunEntry } from "@dragons/db/schema";
import { EventEmitter } from "events";
import type Redis from "ioredis";
import { redis as sharedRedis } from "../../config/redis";
import { logger } from "../../config/logger";

const log = logger.child({ service: "sync-logger" });

export type EntityType = "league" | "match" | "standing" | "team" | "venue" | "referee" | "refereeRole" | "refereeGame";
export type ActionType = "created" | "updated" | "skipped" | "failed";

export interface LogEntry {
  entityType: EntityType;
  entityId: string;
  entityName?: string;
  action: ActionType;
  message?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export class SyncLogger {
  private syncRunId: number;
  private entries: NewSyncRunEntry[] = [];
  private batchSize = 50;
  private eventEmitter: EventEmitter;
  private redis: Redis | null = null;
  private channelName: string;
  private redisFailedAt = 0;
  private flushRetries = 0;
  private static readonly MAX_FLUSH_RETRIES = 3;
  private static readonly REDIS_RECOVERY_COOLDOWN_MS = 30_000;

  private shouldAttemptRedis(): boolean {
    if (this.redisFailedAt === 0) return true;
    return Date.now() - this.redisFailedAt > SyncLogger.REDIS_RECOVERY_COOLDOWN_MS;
  }

  constructor(syncRunId: number, redisInstance?: Redis | null) {
    this.syncRunId = syncRunId;
    this.eventEmitter = new EventEmitter();
    this.channelName = `sync:${syncRunId}:logs`;

    try {
      this.redis = redisInstance !== undefined ? redisInstance : sharedRedis;
    } catch {
      log.warn("Redis not available, streaming disabled");
    }
  }

  async log(entry: LogEntry): Promise<void> {
    const dbEntry: NewSyncRunEntry = {
      syncRunId: this.syncRunId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      entityName: entry.entityName,
      action: entry.action,
      message: entry.message,
      metadata: entry.metadata,
    };

    this.entries.push(dbEntry);

    this.eventEmitter.emit("entry", entry);

    if (this.redis && this.shouldAttemptRedis()) {
      try {
        await this.redis.publish(
          this.channelName,
          JSON.stringify({ ...entry, timestamp: new Date().toISOString() }),
        );
        this.redisFailedAt = 0;
      } catch {
        this.redisFailedAt = Date.now();
        log.warn("Redis publish failed, streaming paused");
      }
    }

    if (this.entries.length >= this.batchSize) {
      await this.flush();
    }
  }

  async logBatch(entries: LogEntry[]): Promise<void> {
    for (const entry of entries) {
      await this.log(entry);
    }
  }

  async flush(): Promise<void> {
    if (this.entries.length === 0) return;

    const toInsert = [...this.entries];
    this.entries = [];

    try {
      await db.insert(syncRunEntries).values(toInsert);
      this.flushRetries = 0;
    } catch (error) {
      this.flushRetries++;
      if (this.flushRetries < SyncLogger.MAX_FLUSH_RETRIES) {
        log.error({ err: error, retry: this.flushRetries }, "Failed to flush entries, will retry");
        this.entries.push(...toInsert);
      } else {
        log.error(
          { err: error, droppedCount: toInsert.length },
          "Failed to flush entries after max retries, dropping batch",
        );
        this.flushRetries = 0;
      }
    }
  }

  async close(): Promise<void> {
    await this.flush();

    if (this.redis) {
      try {
        await this.redis.publish(this.channelName, JSON.stringify({ type: "complete" }));
      } catch {
        // Ignore
      }
    }

    this.eventEmitter.emit("complete");
  }

  getChannelName(): string {
    return this.channelName;
  }

  on(event: "entry" | "complete", listener: (data: LogEntry | undefined) => void): void {
    this.eventEmitter.on(event, listener);
  }

  off(event: "entry" | "complete", listener: (data: LogEntry | undefined) => void): void {
    this.eventEmitter.off(event, listener);
  }
}

export function batchAction(created: number, updated: number, failed: number): ActionType {
  if (failed > 0) return "failed";
  if (created > 0 || updated > 0) return "updated";
  return "skipped";
}

export function createSyncLogger(syncRunId: number, redisInstance?: Redis | null): SyncLogger {
  return new SyncLogger(syncRunId, redisInstance);
}
