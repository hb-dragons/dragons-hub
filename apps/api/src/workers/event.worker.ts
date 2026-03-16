import { Worker, Job } from "bullmq";
import { eq } from "drizzle-orm";
import {
  domainEvents,
  watchRules,
  channelConfigs,
  digestBuffer,
} from "@dragons/db/schema";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { db } from "../config/database";
import { evaluateRule, type RuleInput } from "../services/notifications/rule-engine";
import { getDefaultNotificationsForEvent } from "../services/notifications/role-defaults";
import { renderEventMessage } from "../services/notifications/templates/index";
import { InAppChannelAdapter } from "../services/notifications/channels/in-app";

interface EventJobData {
  eventId: string;
  type: string;
  urgency: string;
  entityType: string;
  entityId: number;
}

const inAppAdapter = new InAppChannelAdapter();

export const eventWorker = new Worker<EventJobData>(
  "domain-events",
  async (job: Job<EventJobData>) => {
    const log = logger.child({ jobId: job.id, eventId: job.data.eventId });
    log.info({ eventType: job.data.type }, "Processing domain event");

    // Load the full event from DB
    const [event] = await db
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.id, job.data.eventId))
      .limit(1);

    if (!event) {
      log.warn("Event not found in database, skipping");
      return { skipped: true, reason: "event_not_found" };
    }

    const payload = event.payload as Record<string, unknown>;
    const effectiveUrgency = event.urgency as "immediate" | "routine";

    // Load all enabled watch rules
    const rules = await db
      .select()
      .from(watchRules)
      .where(eq(watchRules.enabled, true));

    // Load all enabled channel configs
    const configs = await db
      .select()
      .from(channelConfigs)
      .where(eq(channelConfigs.enabled, true));

    const configById = new Map(configs.map((c) => [c.id, c]));

    // Track which channels we've dispatched to (for dedup)
    const dispatched = new Set<string>();
    let dispatchedCount = 0;
    let bufferedCount = 0;

    // Evaluate watch rules
    for (const rule of rules) {
      const ruleInput: RuleInput = {
        eventTypes: rule.eventTypes,
        filters: rule.filters,
        channels: rule.channels,
        urgencyOverride: rule.urgencyOverride,
        enabled: rule.enabled,
      };

      const result = evaluateRule(ruleInput, event.type, payload, event.source);
      if (!result.matched) continue;

      const urgency = (result.urgencyOverride as "immediate" | "routine") ?? effectiveUrgency;

      for (const channelTarget of result.channels) {
        const dedupKey = `rule:${rule.id}:${channelTarget.channel}:${channelTarget.targetId}`;
        if (dispatched.has(dedupKey)) continue;
        dispatched.add(dedupKey);

        // Look up channel config by targetId (the config's ID)
        const config = configById.get(Number(channelTarget.targetId));
        if (!config) continue;

        // Always buffer for digest
        await bufferForDigest(event.id, config.id);
        bufferedCount++;

        // For immediate events, also dispatch now
        if (urgency === "immediate") {
          const locale = (config.config as Record<string, unknown>)?.locale as string ?? "de";
          const message = renderEventMessage(
            event.type,
            payload,
            event.entityName,
            locale,
          );

          if (channelTarget.channel === "in_app") {
            await inAppAdapter.send({
              eventId: event.id,
              watchRuleId: rule.id,
              channelConfigId: config.id,
              recipientId: channelTarget.targetId,
              title: message.title,
              body: message.body,
              locale,
            });
            dispatchedCount++;
          }
        }
      }
    }

    // Role-based defaults
    const defaults = getDefaultNotificationsForEvent(event.type, payload, event.source);
    for (const defaultNotif of defaults) {
      const config = configs.find((c) => c.type === defaultNotif.channel);
      if (!config) continue;

      const recipientId = defaultNotif.refereeId
        ? `referee:${defaultNotif.refereeId}`
        : `audience:${defaultNotif.audience}`;

      const dedupKey = `default:${defaultNotif.channel}:${recipientId}`;
      if (dispatched.has(dedupKey)) continue;
      dispatched.add(dedupKey);

      // Always buffer for digest
      await bufferForDigest(event.id, config.id);
      bufferedCount++;

      // For immediate events, dispatch now
      if (effectiveUrgency === "immediate") {
        const locale = (config.config as Record<string, unknown>)?.locale as string ?? "de";
        const message = renderEventMessage(
          event.type,
          payload,
          event.entityName,
          locale,
        );

        if (defaultNotif.channel === "in_app") {
          await inAppAdapter.send({
            eventId: event.id,
            watchRuleId: null,
            channelConfigId: config.id,
            recipientId,
            title: message.title,
            body: message.body,
            locale,
          });
          dispatchedCount++;
        }
      }
    }

    log.info(
      { dispatched: dispatchedCount, buffered: bufferedCount },
      "Domain event processed",
    );

    return { dispatched: dispatchedCount, buffered: bufferedCount };
  },
  {
    prefix: "{bull}",
    connection: { url: env.REDIS_URL },
    concurrency: 5,
  },
);

async function bufferForDigest(eventId: string, channelConfigId: number): Promise<void> {
  try {
    await db
      .insert(digestBuffer)
      .values({ eventId, channelConfigId })
      .onConflictDoNothing();
  } catch (error) {
    logger.warn(
      { eventId, channelConfigId, error },
      "Failed to buffer event for digest",
    );
  }
}

eventWorker.on("completed", (job) => {
  logger.debug({ jobId: job.id }, "Event job completed");
});

eventWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Event job failed");
});

eventWorker.on("error", (err) => {
  logger.error({ err }, "Event worker error");
});
