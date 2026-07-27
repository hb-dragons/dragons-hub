import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

// --- Mock setup ---
//
// drizzle-orm and @dragons/db/schema are NOT mocked here. Everything this module
// does to the database is a predicate over rows the tests care about:
//   - startup reclaim:   select where eq(syncRuns.status,"running"),
//                        update where inArray(syncRuns.id, deadRunIds)
//   - retention cleanup: lt(syncRuns.startedAt, cutoff) /
//                        lt(domainEvents.occurredAt, cutoff), then FK-ordered
//                        deletes keyed by inArray
//   - scheduled digests: and(eq(enabled,true), eq(digestMode,"scheduled"))
//   - shutdown:          and(eq(status,"running"), eq(ownerInstanceId, INSTANCE_ID))
// The last one is the load-bearing one: without the owner clause a rolling
// deploy kills the *other* instance's in-flight run. With `eq`/`and`/`lt`/
// `inArray` stubbed to bare `vi.fn()`s, `expect(mockDbUpdate).toHaveBeenCalled()`
// checks neither rows, status nor predicate — the exact assertion issue #110
// calls out. So the DB is a real (PGlite, in-process) Postgres.
//
// The BullMQ queues/workers and the Redis-backed heartbeat stay mocked: they are
// out-of-process infrastructure, and Redis is shared with other test runs.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

vi.mock("../config/logger", () => {
  const log = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  };
  log.child.mockReturnValue(log);
  return { logger: log };
});

const INSTANCE_ID = "MOCK_INSTANCE_ID";
const mockStartHeartbeat = vi.fn();
const mockStopHeartbeat = vi.fn();
const mockFilterAliveInstances =
  vi.fn<(ids: (string | null)[]) => Promise<Set<string>>>(async () => new Set());
vi.mock("./instance-heartbeat", () => ({
  startHeartbeat: (...args: unknown[]) => mockStartHeartbeat(...args),
  stopHeartbeat: (...args: unknown[]) => mockStopHeartbeat(...args),
  filterAliveInstances: (ids: (string | null)[]) => mockFilterAliveInstances(ids),
  INSTANCE_ID: "MOCK_INSTANCE_ID",
}));

const mockInitScheduledJobs = vi.fn().mockResolvedValue(undefined);
const mockSyncQueueClose = vi.fn().mockResolvedValue(undefined);
const mockDigestQueueClose = vi.fn().mockResolvedValue(undefined);
const mockDomainEventsQueueClose = vi.fn().mockResolvedValue(undefined);
const mockDigestQueueAdd = vi.fn().mockResolvedValue({ id: "digest-job-1" });
const mockDigestQueueGetRepeatableJobs = vi.fn().mockResolvedValue([]);
const mockDigestQueueRemoveRepeatableByKey = vi.fn().mockResolvedValue(undefined);
const mockRefereeRemindersQueueClose = vi.fn().mockResolvedValue(undefined);
const mockPushReceiptQueueClose = vi.fn().mockResolvedValue(undefined);
const mockSyncQueueAdd = vi.fn().mockResolvedValue({ id: "sync-job-1" });
const mockInitTaskReminders = vi.fn().mockResolvedValue(undefined);
const mockTaskRemindersQueueGetRepeatableJobs = vi.fn().mockResolvedValue([]);
const mockTaskRemindersQueueClose = vi.fn().mockResolvedValue(undefined);
const mockOutboxPollQueueClose = vi.fn().mockResolvedValue(undefined);
const mockTriggerRefereeGamesSync = vi.fn().mockResolvedValue(null);
vi.mock("../services/sync-jobs.service", () => ({
  initializeScheduledJobs: (...args: unknown[]) => mockInitScheduledJobs(...args),
  initTaskReminders: (...args: unknown[]) => mockInitTaskReminders(...args),
  triggerRefereeGamesSync: (...args: unknown[]) => mockTriggerRefereeGamesSync(...args),
}));

vi.mock("./queues", () => ({
  syncQueue: {
    close: (...args: unknown[]) => mockSyncQueueClose(...args),
    add: (...args: unknown[]) => mockSyncQueueAdd(...args),
  },
  domainEventsQueue: { close: (...args: unknown[]) => mockDomainEventsQueueClose(...args) },
  refereeRemindersQueue: { close: (...args: unknown[]) => mockRefereeRemindersQueueClose(...args) },
  pushReceiptQueue: { close: (...args: unknown[]) => mockPushReceiptQueueClose(...args) },
  taskRemindersQueue: {
    close: (...args: unknown[]) => mockTaskRemindersQueueClose(...args),
    getRepeatableJobs: () => mockTaskRemindersQueueGetRepeatableJobs(),
  },
  outboxPollQueue: { close: (...args: unknown[]) => mockOutboxPollQueueClose(...args) },
  digestQueue: {
    close: (...args: unknown[]) => mockDigestQueueClose(...args),
    add: (...args: unknown[]) => mockDigestQueueAdd(...args),
    getRepeatableJobs: () => mockDigestQueueGetRepeatableJobs(),
    removeRepeatableByKey: (...args: unknown[]) => mockDigestQueueRemoveRepeatableByKey(...args),
  },
}));

const mockWorkerClose = vi.fn().mockResolvedValue(undefined);
const mockWorkerOn = vi.fn();
vi.mock("./sync.worker", () => ({
  syncWorker: {
    close: (...args: unknown[]) => mockWorkerClose(...args),
    on: (...args: unknown[]) => mockWorkerOn(...args),
  },
}));

const mockEventWorkerClose = vi.fn().mockResolvedValue(undefined);
vi.mock("./event.worker", () => ({
  eventWorker: { close: (...args: unknown[]) => mockEventWorkerClose(...args) },
}));

const mockRefereeReminderWorkerClose = vi.fn().mockResolvedValue(undefined);
vi.mock("./referee-reminder.worker", () => ({
  refereeReminderWorker: { close: (...args: unknown[]) => mockRefereeReminderWorkerClose(...args) },
}));

const mockPushReceiptWorkerClose = vi.fn().mockResolvedValue(undefined);
vi.mock("./push-receipt.worker", () => ({
  pushReceiptWorker: { close: (...args: unknown[]) => mockPushReceiptWorkerClose(...args) },
}));

const mockTaskReminderWorkerClose = vi.fn().mockResolvedValue(undefined);
vi.mock("./task-reminder.worker", () => ({
  taskReminderWorker: { close: (...args: unknown[]) => mockTaskReminderWorkerClose(...args) },
}));

const mockOutboxPollWorkerClose = vi.fn().mockResolvedValue(undefined);
vi.mock("./outbox-poll.worker", () => ({
  outboxPollWorker: { close: (...args: unknown[]) => mockOutboxPollWorkerClose(...args) },
}));

vi.mock("../services/events/outbox-poller", () => ({
  pollOutbox: vi.fn().mockResolvedValue(0),
}));

vi.mock("../services/notifications/seed-referee-watch-rule", () => ({
  seedRefereeNotificationConfig: vi.fn().mockResolvedValue(undefined),
}));

const mockSyncRefereeGames = vi.fn().mockResolvedValue({ created: 0, updated: 0, unchanged: 0 });
vi.mock("../services/sync/referee-games.sync", () => ({
  syncRefereeGames: (...args: unknown[]) => mockSyncRefereeGames(...args),
}));

// --- Imports (after mocks) ---

import {
  initializeWorkers,
  shutdownWorkers,
  cleanupOldSyncRuns,
  cleanupOldDomainEvents,
  initializeScheduledDigests,
} from "./index";
import { logger } from "../config/logger";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../test/setup-test-db";

let ctx: TestDbContext;

beforeAll(async () => {
  // Retention cutoffs are computed with local-time `Date#setDate`; this machine
  // runs Europe/Berlin while the container runs UTC. Pin a zone so a day-boundary
  // regression cannot hide behind the developer's own offset.
  vi.stubEnv("TZ", "UTC");
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
  mockFilterAliveInstances.mockResolvedValue(new Set());
  mockDigestQueueGetRepeatableJobs.mockResolvedValue([]);
  mockTaskRemindersQueueGetRepeatableJobs.mockResolvedValue([]);
  mockDigestQueueAdd.mockResolvedValue({ id: "digest-job-1" });
});

afterAll(async () => {
  await closeTestDb(ctx);
  vi.unstubAllEnvs();
});

// --- Helpers ---

const DAY_MS = 24 * 60 * 60 * 1000;

interface SyncRunRow {
  id: number;
  status: string;
  owner_instance_id: string | null;
  error_message: string | null;
  completed_at: Date | null;
}

async function seedRun(opts: {
  status?: string;
  ownerInstanceId?: string | null;
  startedDaysAgo?: number;
} = {}): Promise<number> {
  const r = await ctx.client.query<{ id: number }>(
    `INSERT INTO sync_runs (sync_type, status, triggered_by, started_at, owner_instance_id)
     VALUES ('full', $1, 'cron', $2, $3) RETURNING id`,
    [
      opts.status ?? "running",
      new Date(Date.now() - (opts.startedDaysAgo ?? 0) * DAY_MS),
      opts.ownerInstanceId ?? null,
    ],
  );
  return r.rows[0]!.id;
}

async function runRows(): Promise<SyncRunRow[]> {
  const r = await ctx.client.query<SyncRunRow>(
    `SELECT id, status, owner_instance_id, error_message, completed_at
     FROM sync_runs ORDER BY id`,
  );
  return r.rows;
}

async function seedRunEntry(syncRunId: number): Promise<void> {
  await ctx.client.query(
    `INSERT INTO sync_run_entries (sync_run_id, entity_type, entity_id, action)
     VALUES ($1, 'match', '1', 'created')`,
    [syncRunId],
  );
}

async function seedChannelConfig(opts: {
  name?: string;
  enabled?: boolean;
  digestMode?: string;
  digestCron?: string | null;
  digestTimezone?: string;
}): Promise<number> {
  const r = await ctx.client.query<{ id: number }>(
    `INSERT INTO channel_configs (name, type, enabled, config, digest_mode, digest_cron, digest_timezone)
     VALUES ($1, 'in_app', $2, '{}'::jsonb, $3, $4, $5) RETURNING id`,
    [
      opts.name ?? "Channel",
      opts.enabled ?? true,
      opts.digestMode ?? "scheduled",
      opts.digestCron === undefined ? "0 8 * * *" : opts.digestCron,
      opts.digestTimezone ?? "Europe/Berlin",
    ],
  );
  return r.rows[0]!.id;
}

async function seedDomainEvent(id: string, occurredDaysAgo: number): Promise<string> {
  await ctx.client.query(
    `INSERT INTO domain_events
       (id, type, source, urgency, occurred_at, entity_type, entity_id, entity_name, deep_link_path, payload)
     VALUES ($1, 'match.created', 'sync', 'routine', $2, 'match', 1, 'Game', '/m/1', '{}'::jsonb)`,
    [id, new Date(Date.now() - occurredDaysAgo * DAY_MS)],
  );
  return id;
}

async function countRows(table: string): Promise<number> {
  const r = await ctx.client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
  return Number(r.rows[0]!.n);
}

async function eventIds(): Promise<string[]> {
  const r = await ctx.client.query<{ id: string }>(
    `SELECT id FROM domain_events ORDER BY id`,
  );
  return r.rows.map((row) => row.id);
}

// --- Tests ---

describe("initializeWorkers", () => {
  it("calls initializeScheduledJobs", async () => {
    await initializeWorkers();

    expect(mockInitScheduledJobs).toHaveBeenCalled();
  });

  it("routes the post-sync referee trigger through the queue, not a direct sync (#70)", async () => {
    await initializeWorkers();

    const completedHandler = mockWorkerOn.mock.calls.find(([evt]) => evt === "completed")?.[1] as
      | ((job: { data: { type: string } }) => void)
      | undefined;
    expect(completedHandler).toBeDefined();

    completedHandler!({ data: { type: "full" } });
    await new Promise((r) => setImmediate(r)); // flush the fire-and-forget handler

    expect(mockTriggerRefereeGamesSync).toHaveBeenCalledWith("post-full-sync");
    expect(mockSyncRefereeGames).not.toHaveBeenCalled();
  });

  it("does not re-trigger a referee sync when a referee-games job completes (#70)", async () => {
    await initializeWorkers();

    const completedHandler = mockWorkerOn.mock.calls.find(([evt]) => evt === "completed")?.[1] as
      | ((job: { data: { type: string } }) => void)
      | undefined;

    completedHandler!({ data: { type: "referee-games" } });
    await new Promise((r) => setImmediate(r));

    expect(mockTriggerRefereeGamesSync).not.toHaveBeenCalled();
  });

  it("starts heartbeat before stale-run reclaim", async () => {
    await initializeWorkers();

    expect(mockStartHeartbeat).toHaveBeenCalled();
  });

  it("fails exactly the running runs whose owner is dead, with the stale reason", async () => {
    const dead1 = await seedRun({ status: "running", ownerInstanceId: "dead-instance" });
    const dead2 = await seedRun({ status: "running", ownerInstanceId: "dead-instance" });
    // Not "running": must never be considered for reclaim.
    const pending = await seedRun({ status: "pending", ownerInstanceId: "dead-instance" });
    const completed = await seedRun({ status: "completed", ownerInstanceId: "dead-instance" });
    mockFilterAliveInstances.mockResolvedValue(new Set());

    await initializeWorkers();

    // One heartbeat probe for the whole reclaim, not one per candidate run.
    expect(mockFilterAliveInstances).toHaveBeenCalledOnce();

    const rows = await runRows();
    for (const id of [dead1, dead2]) {
      const row = rows.find((r) => r.id === id)!;
      expect(row.status).toBe("failed");
      expect(row.error_message).toBe("Stale: worker restarted");
      expect(row.completed_at).not.toBeNull();
    }
    expect(rows.find((r) => r.id === pending)).toMatchObject({
      status: "pending",
      error_message: null,
    });
    expect(rows.find((r) => r.id === completed)).toMatchObject({
      status: "completed",
      error_message: null,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      { count: 2, ids: [dead1, dead2] },
      "Marked stale running sync runs as failed",
    );
  });

  it("leaves a run owned by a live instance running (rolling deploy)", async () => {
    const live = await seedRun({ status: "running", ownerInstanceId: "live-instance" });
    mockFilterAliveInstances.mockResolvedValue(new Set(["live-instance"]));

    await initializeWorkers();

    expect((await runRows()).find((r) => r.id === live)).toMatchObject({
      status: "running",
      error_message: null,
      completed_at: null,
    });
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.objectContaining({ ids: [live] }),
      "Marked stale running sync runs as failed",
    );
  });

  it("reclaims only the dead owner's run when live and dead instances coexist", async () => {
    const dead = await seedRun({ status: "running", ownerInstanceId: "dead-instance" });
    const live = await seedRun({ status: "running", ownerInstanceId: "live-instance" });
    mockFilterAliveInstances.mockResolvedValue(new Set(["live-instance"]));

    await initializeWorkers();

    const rows = await runRows();
    expect(rows.find((r) => r.id === dead)!.status).toBe("failed");
    expect(rows.find((r) => r.id === live)!.status).toBe("running");
    expect(logger.warn).toHaveBeenCalledWith(
      { count: 1, ids: [dead] },
      "Marked stale running sync runs as failed",
    );
    // The reclaim asks about owners, once, not about runs.
    expect(mockFilterAliveInstances).toHaveBeenCalledOnce();
    expect(mockFilterAliveInstances.mock.calls[0]![0]).toEqual([
      "dead-instance",
      "live-instance",
    ]);
  });

  // A run written before owner_instance_id existed (or by a crash mid-insert)
  // has no owner to probe, so nothing can vouch for it: reclaim it.
  it("reclaims a running run with no owner instance", async () => {
    const orphan = await seedRun({ status: "running", ownerInstanceId: null });
    mockFilterAliveInstances.mockResolvedValue(new Set());

    await initializeWorkers();

    expect((await runRows()).find((r) => r.id === orphan)!.status).toBe("failed");
  });

  it("does not log warning when no stale runs found", async () => {
    await initializeWorkers();

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("runs cleanup of old sync runs", async () => {
    await seedRun({ status: "completed", startedDaysAgo: 200 });
    await seedRun({ status: "completed", startedDaysAgo: 120 });
    const recent = await seedRun({ status: "completed", startedDaysAgo: 1 });

    await initializeWorkers();

    expect((await runRows()).map((r) => r.id)).toEqual([recent]);
    expect(logger.info).toHaveBeenCalledWith({ count: 2 }, "Cleaned up old sync runs");
  });

  it("continues if cleanup fails", async () => {
    const realDb = ctx.db as unknown as Record<string, unknown>;
    let selectCalls = 0;
    dbHolder.ref = new Proxy(realDb, {
      get(target, prop) {
        if (prop === "select") {
          // The first select is the startup reclaim; the second is
          // cleanupOldSyncRuns, which must be the one that blows up.
          selectCalls++;
          if (selectCalls === 2) {
            return () => {
              throw new Error("DB error");
            };
          }
        }
        return target[prop as string];
      },
    });

    try {
      await initializeWorkers();
    } finally {
      dbHolder.ref = ctx.db;
    }

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "Failed to cleanup old sync runs",
    );
    expect(mockInitScheduledJobs).toHaveBeenCalled();
  });

  it("initializes task reminder repeatable job", async () => {
    mockTaskRemindersQueueGetRepeatableJobs.mockResolvedValue([
      { id: "task-reminder-sweep-cron" },
    ]);

    await initializeWorkers();

    expect(mockInitTaskReminders).toHaveBeenCalled();
  });
});

describe("cleanupOldSyncRuns", () => {
  it("returns 0 and deletes nothing when every run is inside the retention window", async () => {
    const recent = await seedRun({ status: "completed", startedDaysAgo: 10 });

    const result = await cleanupOldSyncRuns();

    expect(result).toBe(0);
    expect((await runRows()).map((r) => r.id)).toEqual([recent]);
  });

  it("deletes old runs and their FK-dependent entries, sparing recent ones", async () => {
    const old1 = await seedRun({ status: "completed", startedDaysAgo: 100 });
    const old2 = await seedRun({ status: "completed", startedDaysAgo: 91 });
    const recent = await seedRun({ status: "completed", startedDaysAgo: 89 });
    await seedRunEntry(old1);
    await seedRunEntry(old2);
    await seedRunEntry(recent);

    const result = await cleanupOldSyncRuns(90);

    expect(result).toBe(2);
    expect((await runRows()).map((r) => r.id)).toEqual([recent]);
    // The entries of the deleted runs went with them; the survivor keeps its own.
    expect(await countRows("sync_run_entries")).toBe(1);
  });

  it("honours a custom retention window", async () => {
    const beyond = await seedRun({ status: "completed", startedDaysAgo: 40 });
    const within = await seedRun({ status: "completed", startedDaysAgo: 20 });

    // Default 90 days would keep both; 30 keeps only the newer one.
    expect(await cleanupOldSyncRuns(30)).toBe(1);
    expect((await runRows()).map((r) => r.id)).toEqual([within]);
    expect(beyond).not.toBe(within);
  });
});

describe("cleanupOldDomainEvents", () => {
  it("returns zeros and deletes nothing when no event is past retention", async () => {
    await seedDomainEvent("evt-recent", 10);

    const result = await cleanupOldDomainEvents();

    expect(result).toEqual({ notifications: 0, digestEntries: 0, events: 0 });
    expect(await eventIds()).toEqual(["evt-recent"]);
  });

  it("deletes notification_log and digest_buffer rows before the events they reference", async () => {
    const channelConfigId = await seedChannelConfig({ name: "C", digestMode: "per_sync" });
    await seedDomainEvent("evt-old-1", 400);
    await seedDomainEvent("evt-old-2", 400);
    await seedDomainEvent("evt-new", 10);

    await ctx.client.query(
      `INSERT INTO notification_log (event_id, channel_config_id, recipient_id, title, body)
       VALUES ('evt-old-1', $1, 'user:a', 't', 'b'),
              ('evt-old-2', $1, 'user:b', 't', 'b'),
              ('evt-new',   $1, 'user:c', 't', 'b')`,
      [channelConfigId],
    );
    await ctx.client.query(
      `INSERT INTO digest_buffer (event_id, channel_config_id)
       VALUES ('evt-old-1', $1), ('evt-new', $1)`,
      [channelConfigId],
    );

    const result = await cleanupOldDomainEvents(365);

    expect(result).toEqual({ notifications: 2, digestEntries: 1, events: 2 });
    expect(await eventIds()).toEqual(["evt-new"]);
    expect(await countRows("notification_log")).toBe(1);
    expect(await countRows("digest_buffer")).toBe(1);
  });

  it("keeps batching until the whole backlog is gone", async () => {
    // CLEANUP_BATCH_SIZE is 500, so 501 old events need two passes; a loop that
    // stops after the first batch would leave one behind.
    const values: string[] = [];
    const params: unknown[] = [new Date(Date.now() - 400 * DAY_MS)];
    for (let i = 0; i < 501; i++) {
      values.push(
        `($${params.length + 1}, 'match.created', 'sync', 'routine', $1, 'match', 1, 'G', '/m/1', '{}'::jsonb)`,
      );
      params.push(`evt-${String(i).padStart(4, "0")}`);
    }
    await ctx.client.query(
      `INSERT INTO domain_events
         (id, type, source, urgency, occurred_at, entity_type, entity_id, entity_name, deep_link_path, payload)
       VALUES ${values.join(",")}`,
      params,
    );
    await seedDomainEvent("evt-keep", 5);

    const result = await cleanupOldDomainEvents(365);

    expect(result.events).toBe(501);
    expect(await eventIds()).toEqual(["evt-keep"]);
  });

  it("honours a custom retention window", async () => {
    await seedDomainEvent("evt-old", 40);
    await seedDomainEvent("evt-new", 20);

    const result = await cleanupOldDomainEvents(30);

    expect(result.events).toBe(1);
    expect(await eventIds()).toEqual(["evt-new"]);
  });
});

describe("shutdownWorkers", () => {
  it("fails only this instance's running runs, never another instance's", async () => {
    const mine = await seedRun({ status: "running", ownerInstanceId: INSTANCE_ID });
    // A sibling container mid-rolling-deploy. Killing this row is the bug the
    // owner clause exists to prevent.
    const theirs = await seedRun({ status: "running", ownerInstanceId: "OTHER_INSTANCE" });
    // Ours, but not running.
    const minePending = await seedRun({ status: "pending", ownerInstanceId: INSTANCE_ID });

    await shutdownWorkers();

    const rows = await runRows();
    expect(rows.find((r) => r.id === mine)).toMatchObject({
      status: "failed",
      error_message: "Server shutdown",
    });
    expect(rows.find((r) => r.id === mine)!.completed_at).not.toBeNull();
    expect(rows.find((r) => r.id === theirs)).toMatchObject({
      status: "running",
      error_message: null,
      completed_at: null,
    });
    expect(rows.find((r) => r.id === minePending)).toMatchObject({
      status: "pending",
      error_message: null,
    });
  });

  it("calls stopHeartbeat on shutdown", async () => {
    await shutdownWorkers();

    expect(mockStopHeartbeat).toHaveBeenCalled();
  });

  it("closes workers and queues", async () => {
    await shutdownWorkers();

    expect(mockWorkerClose).toHaveBeenCalled();
    expect(mockTaskReminderWorkerClose).toHaveBeenCalled();
    expect(mockOutboxPollWorkerClose).toHaveBeenCalled();
    expect(mockOutboxPollQueueClose).toHaveBeenCalled();
    expect(mockSyncQueueClose).toHaveBeenCalled();
    expect(mockDigestQueueClose).toHaveBeenCalled();
    expect(mockDomainEventsQueueClose).toHaveBeenCalled();
  });

  it("continues shutdown even if DB update fails", async () => {
    dbHolder.ref = {
      update: () => {
        throw new Error("DB error");
      },
    };

    try {
      await shutdownWorkers();
    } finally {
      dbHolder.ref = ctx.db;
    }

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "Failed to mark running syncs as failed",
    );
    expect(mockWorkerClose).toHaveBeenCalled();
    expect(mockOutboxPollWorkerClose).toHaveBeenCalled();
    expect(mockOutboxPollQueueClose).toHaveBeenCalled();
    expect(mockSyncQueueClose).toHaveBeenCalled();
    expect(mockDigestQueueClose).toHaveBeenCalled();
    expect(mockDomainEventsQueueClose).toHaveBeenCalled();
  });
});

describe("initializeScheduledDigests", () => {
  it("removes stale repeatable jobs and schedules one job per enabled scheduled channel", async () => {
    mockDigestQueueGetRepeatableJobs.mockResolvedValue([
      { key: "old-key-1" },
      { key: "old-key-2" },
    ]);
    const berlin = await seedChannelConfig({
      name: "Berlin",
      digestCron: "0 8 * * *",
      digestTimezone: "Europe/Berlin",
    });
    const newYork = await seedChannelConfig({
      name: "New York",
      digestCron: "0 18 * * *",
      digestTimezone: "America/New_York",
    });
    // Neither of these may produce a job.
    await seedChannelConfig({ name: "Disabled", enabled: false });
    await seedChannelConfig({ name: "Per sync", digestMode: "per_sync" });

    await initializeScheduledDigests();

    expect(mockDigestQueueRemoveRepeatableByKey).toHaveBeenCalledTimes(2);
    expect(mockDigestQueueAdd).toHaveBeenCalledTimes(2);
    expect(mockDigestQueueAdd).toHaveBeenCalledWith(
      `scheduled-digest:${berlin}`,
      expect.objectContaining({ channelConfigId: berlin }),
      { repeat: { pattern: "0 8 * * *", tz: "Europe/Berlin" } },
    );
    expect(mockDigestQueueAdd).toHaveBeenCalledWith(
      `scheduled-digest:${newYork}`,
      expect.objectContaining({ channelConfigId: newYork }),
      { repeat: { pattern: "0 18 * * *", tz: "America/New_York" } },
    );
    expect(logger.info).toHaveBeenCalledWith(
      { count: 2 },
      "Scheduled digest jobs initialized",
    );
  });

  it("skips channels with no digestCron", async () => {
    const id = await seedChannelConfig({ name: "No cron", digestCron: null });

    await initializeScheduledDigests();

    expect(mockDigestQueueAdd).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      { channelConfigId: id },
      "Channel has digestMode=scheduled but no digestCron, skipping",
    );
  });

  it("does nothing when no scheduled channels exist", async () => {
    await seedChannelConfig({ name: "Per sync", digestMode: "per_sync" });
    await seedChannelConfig({ name: "Disabled", enabled: false });

    await initializeScheduledDigests();

    expect(mockDigestQueueAdd).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalledWith(
      expect.objectContaining({ count: expect.any(Number) }),
      "Scheduled digest jobs initialized",
    );
  });
});
