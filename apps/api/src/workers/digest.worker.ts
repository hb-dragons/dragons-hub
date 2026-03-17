import { Worker, type Job } from "bullmq";
import { eq, and, inArray } from "drizzle-orm";
import { digestBuffer, domainEvents, channelConfigs, notificationLog } from "@dragons/db/schema";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { db } from "../config/database";
import { renderDigestMessage, type DigestItem } from "../services/notifications/templates/digest";

interface DigestJobData {
  channelConfigId: number;
  digestRunId: number;
}

export const digestWorker = new Worker<DigestJobData>(
  "digest",
  async (job: Job<DigestJobData>) => {
    const { channelConfigId, digestRunId } = job.data;
    const log = logger.child({ jobId: job.id, channelConfigId, digestRunId });
    log.info("Processing digest job");

    // 1. Load the channel config
    const [config] = await db
      .select()
      .from(channelConfigs)
      .where(eq(channelConfigs.id, channelConfigId))
      .limit(1);

    if (!config) {
      log.warn("Channel config not found, skipping");
      return { skipped: true, reason: "channel_config_not_found" };
    }

    if (!config.enabled) {
      log.warn("Channel config disabled, skipping");
      return { skipped: true, reason: "channel_disabled" };
    }

    // 2. Load all buffered events for this channel
    const bufferedRows = await db
      .select({
        bufferId: digestBuffer.id,
        eventId: digestBuffer.eventId,
        type: domainEvents.type,
        payload: domainEvents.payload,
        entityName: domainEvents.entityName,
        deepLinkPath: domainEvents.deepLinkPath,
        urgency: domainEvents.urgency,
        occurredAt: domainEvents.occurredAt,
      })
      .from(digestBuffer)
      .innerJoin(domainEvents, eq(digestBuffer.eventId, domainEvents.id))
      .where(eq(digestBuffer.channelConfigId, channelConfigId));

    if (bufferedRows.length === 0) {
      log.info("No buffered events, skipping digest");
      return { skipped: true, reason: "no_events" };
    }

    log.info({ eventCount: bufferedRows.length }, "Rendering digest");

    // 3. Build digest items
    const items: DigestItem[] = bufferedRows.map((row) => ({
      eventType: row.type,
      payload: row.payload as Record<string, unknown>,
      entityName: row.entityName,
      deepLinkPath: row.deepLinkPath,
      urgency: row.urgency,
      occurredAt: row.occurredAt,
    }));

    // 4. Render digest message — read locale from channel config, fall back to German
    const locale = (config.config as Record<string, unknown>)?.locale as string ?? "de";
    const message = renderDigestMessage(items, locale);

    // 5. Deliver and clear buffer atomically in a transaction.
    // This prevents a race where two concurrent digest jobs for the same channel
    // both read the buffer, both send, and both clear — losing data.
    const bufferIds = bufferedRows.map((r) => r.bufferId);

    await db.transaction(async (tx) => {
      if (config.type === "in_app") {
        const anchorEventId = bufferedRows[0]!.eventId;

        // Insert notification_log entry (dedup via unique index)
        const rows = await tx
          .insert(notificationLog)
          .values({
            eventId: anchorEventId,
            watchRuleId: null,
            channelConfigId: config.id,
            recipientId: `digest:${config.id}`,
            title: message.title,
            body: message.body,
            locale,
            status: "sent",
            sentAt: new Date(),
            digestRunId,
          })
          .onConflictDoNothing()
          .returning({ id: notificationLog.id });

        if (rows.length === 0) {
          log.info("Digest already sent (duplicate), clearing stale buffer entries");
        }
      } else {
        log.warn({ channelType: config.type }, "Unsupported channel type for digest, skipping delivery");
      }

      // Clear the buffer for this channel within the same transaction
      await tx.delete(digestBuffer).where(inArray(digestBuffer.id, bufferIds));
    });

    log.info(
      { eventCount: bufferedRows.length, channelType: config.type },
      "Digest delivered and buffer cleared",
    );

    return { delivered: true, eventCount: bufferedRows.length, digestRunId };
  },
  {
    prefix: "{bull}",
    connection: { url: env.REDIS_URL },
    concurrency: 3,
  },
);

/* v8 ignore next 3 */
digestWorker.on("completed", (job) => {
  logger.debug({ jobId: job.id }, "Digest job completed");
});

/* v8 ignore next 3 */
digestWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Digest job failed");
});

/* v8 ignore next 3 */
digestWorker.on("error", (err) => {
  logger.error({ err }, "Digest worker error");
});
