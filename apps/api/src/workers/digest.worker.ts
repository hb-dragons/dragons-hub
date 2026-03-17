import { Worker, type Job } from "bullmq";
import { eq, and } from "drizzle-orm";
import { digestBuffer, domainEvents, channelConfigs, notificationLog } from "@dragons/db/schema";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { db } from "../config/database";
import { renderDigestMessage, type DigestItem } from "../services/notifications/templates/digest";
import { InAppChannelAdapter } from "../services/notifications/channels/in-app";

interface DigestJobData {
  channelConfigId: number;
  digestRunId: number;
}

const inAppAdapter = new InAppChannelAdapter();

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

    // 5. Deliver via the appropriate channel adapter
    // Create a single summary notification_log entry for the whole digest
    if (config.type === "in_app") {
      // Use the first event's ID as the anchor for the digest notification
      const anchorEventId = bufferedRows[0]!.eventId;
      const result = await inAppAdapter.send({
        eventId: anchorEventId,
        watchRuleId: null,
        channelConfigId: config.id,
        recipientId: `digest:${config.id}`,
        title: message.title,
        body: message.body,
        locale,
      });

      if (result.success && !result.duplicate) {
        // Tag the notification_log entry with the digestRunId
        await db
          .update(notificationLog)
          .set({ digestRunId })
          .where(
            and(
              eq(notificationLog.eventId, anchorEventId),
              eq(notificationLog.channelConfigId, config.id),
              eq(notificationLog.recipientId, `digest:${config.id}`),
            ),
          );
      } else if (!result.success) {
        log.error({ eventId: anchorEventId, error: result.error }, "Failed to deliver digest");
      }
    } else {
      log.warn({ channelType: config.type }, "Unsupported channel type for digest, skipping delivery");
    }

    // 6. Clear the buffer for this channel (single batch delete)
    await db.delete(digestBuffer).where(eq(digestBuffer.channelConfigId, channelConfigId));

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
