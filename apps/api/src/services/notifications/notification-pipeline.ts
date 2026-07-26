import { eq, inArray } from "drizzle-orm";
import {
  watchRules,
  channelConfigs,
  digestBuffer,
  userNotificationPreferences,
} from "@dragons/db/schema";
import type { DomainEventRow } from "@dragons/db/schema";
import { getDb } from "../../config/database";
import { getRedis } from "../../config/redis";
import { evaluateRule, type RuleInput } from "./rule-engine";
import { getDefaultNotificationsForEvent } from "./role-defaults";
import { renderEventMessage } from "./templates/index";
import { InAppChannelAdapter } from "./channels/in-app";
import { WhatsAppGroupAdapter } from "./channels/whatsapp-group";
import { PushChannelAdapter } from "./channels/push";
import { ExpoPushClient } from "./expo-push.client";
import { resolveRecipientUserIds } from "./recipient-resolver";
import { renderRefereeSlotsWhatsApp } from "./templates/referee-slots";
import { env } from "../../config/env";
import type { RefereeSlotsPayload } from "@dragons/shared";
import { parseWhatsAppGroupConfig, readLocale } from "./channel-config-parsers";
import { logger } from "../../config/logger";

// ── Config type alias ────────────────────────────────────────────────────────

type ChannelConfigRow = Awaited<ReturnType<typeof loadRulesAndConfigs>>["configs"][number];

// ── Coalescing window ────────────────────────────────────────────────────────

const COALESCE_WINDOW_SEC = 60;

// ── Muted event types ────────────────────────────────────────────────────────

/**
 * Load muted event types from user_notification_preferences.
 * Returns a Map from recipientId → Set of muted event type strings.
 *
 * For "referee:123" recipients, maps the refereeId back to a userId
 * to look up preferences. For "audience:admin", muting is not applied
 * (group recipients don't have individual preferences).
 */
export async function loadMutedEventTypes(
  recipientIds: string[],
): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>();

  const refereeRecipients = recipientIds.filter((r) => r.startsWith("referee:"));
  const userRecipients = recipientIds.filter((r) => r.startsWith("user:"));
  if (refereeRecipients.length === 0 && userRecipients.length === 0) return result;

  // The stored user_id is the literal "referee:<id>" for referee prefs but the
  // bare id for user prefs (the recipient strips the "user:" prefix below), so
  // build the lookup set to match both keyings — and constrain the query to it
  // instead of scanning the whole preferences table on every event.
  const lookupIds = [
    ...refereeRecipients,
    ...userRecipients.map((r) => r.slice("user:".length)),
  ];

  try {
    const prefs = await getDb()
      .select({
        userId: userNotificationPreferences.userId,
        mutedEventTypes: userNotificationPreferences.mutedEventTypes,
      })
      .from(userNotificationPreferences)
      .where(inArray(userNotificationPreferences.userId, lookupIds));

    const userMutedMap = new Map<string, Set<string>>();
    for (const pref of prefs) {
      if (pref.mutedEventTypes.length > 0) {
        userMutedMap.set(pref.userId, new Set(pref.mutedEventTypes));
      }
    }

    for (const rid of refereeRecipients) {
      const muted = userMutedMap.get(rid);
      if (muted) result.set(rid, muted);
    }

    for (const rid of userRecipients) {
      const userId = rid.slice("user:".length);
      const muted = userMutedMap.get(userId);
      if (muted) result.set(rid, muted);
    }
  } catch {
    logger.debug("Could not load muted event types, skipping preference check");
  }

  return result;
}

// ── Pipeline types ───────────────────────────────────────────────────────────

export interface PipelineResult {
  dispatched: number;
  buffered: number;
  coalesced: number;
  muted: number;
  configs: ChannelConfigRow[];
}

// ── Pipeline steps ───────────────────────────────────────────────────────────

const inAppAdapter = new InAppChannelAdapter();
const whatsAppGroupAdapter = new WhatsAppGroupAdapter();
const expoPushClient = new ExpoPushClient({ accessToken: env.EXPO_ACCESS_TOKEN });
const pushAdapter = new PushChannelAdapter(expoPushClient);

/**
 * Step 1: Load watch rules and channel configs from DB.
 */
async function loadRulesAndConfigs() {
  const [rules, configs] = await Promise.all([
    getDb().select().from(watchRules).where(eq(watchRules.enabled, true)),
    getDb().select().from(channelConfigs).where(eq(channelConfigs.enabled, true)),
  ]);
  return { rules, configs };
}

/**
 * Step 2: Evaluate watch rules against the event.
 * Returns matched channels with their config and urgency.
 */
function evaluateWatchRules(
  event: DomainEventRow,
  rules: Awaited<ReturnType<typeof loadRulesAndConfigs>>["rules"],
  configById: Map<number, ChannelConfigRow>,
) {
  const payload = event.payload as Record<string, unknown>;
  const effectiveUrgency = event.urgency as "immediate" | "routine";
  const matches: Array<{
    channelTarget: { channel: string; targetId: string };
    config: ChannelConfigRow;
    urgency: "immediate" | "routine";
    watchRuleId: number;
    dedupKey: string;
  }> = [];

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
      const config = configById.get(Number(channelTarget.targetId));
      if (!config) continue;

      matches.push({
        channelTarget,
        config,
        urgency,
        watchRuleId: rule.id,
        dedupKey: `rule:${rule.id}:${channelTarget.channel}:${channelTarget.targetId}`,
      });
    }
  }

  return matches;
}

/**
 * Derive the recipient key a watch-rule match addresses, from its channel
 * config. `in_app` configs carry an audienceRole ("admin" | "referee") which
 * maps to `audience:<role>` — an inbox-addressable, push-resolvable key.
 * Channels without an audience (whatsapp_group, email) deliver to a fixed
 * target, not a user inbox, so they get a non-resolvable label that never
 * masquerades as a user or audience. Never the bare channel-config id, which
 * matches no inbox key and resolves to zero push recipients.
 */
function watchRuleRecipientId(config: { id: number; config: unknown }): string {
  const cfg = config.config;
  const audienceRole =
    cfg && typeof cfg === "object"
      ? (cfg as Record<string, unknown>).audienceRole
      : undefined;
  if (audienceRole === "admin" || audienceRole === "referee") {
    return `audience:${audienceRole}`;
  }
  return `channel:${config.id}`;
}

/**
 * Step 3: Evaluate role-based defaults.
 */
function evaluateDefaults(
  event: DomainEventRow,
  configs: ChannelConfigRow[],
) {
  const payload = event.payload as Record<string, unknown>;
  const effectiveUrgency = event.urgency as "immediate" | "routine";
  const defaults = getDefaultNotificationsForEvent(event.type, payload, event.source);

  const matches: Array<{
    config: ChannelConfigRow;
    urgency: "immediate" | "routine";
    recipientId: string;
    dedupKey: string;
  }> = [];

  for (const defaultNotif of defaults) {
    const matchingConfigs = configs.filter((c) => {
      if (c.type !== defaultNotif.channel) return false;
      const configData = c.config as unknown as Record<string, unknown> | null;
      const audienceRole = configData?.audienceRole as string | undefined;
      if (!audienceRole) return true;
      return audienceRole === defaultNotif.audience;
    });

    const recipientId = defaultNotif.refereeId
      ? `referee:${defaultNotif.refereeId}`
      : defaultNotif.userId
        ? `user:${defaultNotif.userId}`
        : `audience:${defaultNotif.audience}`;

    for (const config of matchingConfigs) {
      matches.push({
        config,
        urgency: effectiveUrgency,
        recipientId,
        dedupKey: `default:${config.id}:${recipientId}`,
      });
    }
  }

  return matches;
}

/**
 * Step 4: Buffer an event for digest delivery.
 */
async function bufferForDigest(eventId: string, channelConfigId: number): Promise<void> {
  try {
    await getDb()
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

async function resolveLocaleForRecipient(
  recipientId: string,
  configLocale: string | undefined,
): Promise<string> {
  if (recipientId.startsWith("user:")) {
    const userId = recipientId.slice("user:".length);
    const [pref] = await getDb()
      .select({ locale: userNotificationPreferences.locale })
      .from(userNotificationPreferences)
      .where(eq(userNotificationPreferences.userId, userId))
      .limit(1);
    return pref?.locale ?? configLocale ?? "de";
  }
  return configLocale ?? "de";
}

/**
 * Step 5: Dispatch an immediate notification via channel adapter.
 *
 * Exported so the admin "retry failed notification" path can re-run delivery for
 * a single (event, channel, recipient) through the same adapters instead of
 * faking a "sent" status.
 */
export async function dispatchImmediate(params: {
  event: DomainEventRow;
  config: { id: number; type: string; config: unknown };
  watchRuleId: number | null;
  recipientId: string;
  channelType: string;
}): Promise<boolean> {
  const { event, config, watchRuleId, recipientId, channelType } = params;
  const payload = event.payload as Record<string, unknown>;
  const configLocale = readLocale(config.config);
  const locale = await resolveLocaleForRecipient(recipientId, configLocale);
  const message = renderEventMessage(event.type, payload, event.entityName, locale);

  if (channelType === "in_app") {
    const sendResult = await inAppAdapter.send({
      eventId: event.id,
      watchRuleId,
      channelConfigId: config.id,
      recipientId,
      title: message.title,
      body: message.body,
      locale,
    });
    return sendResult.success;
  }

  if (channelType === "whatsapp_group") {
    const channelCfg = parseWhatsAppGroupConfig(config.config);
    if (!channelCfg) {
      logger.warn({ channelConfigId: config.id }, "WhatsApp group config invalid or missing groupId");
      return false;
    }
    const groupChatId = channelCfg.groupId;

    // For referee slot events, use the rich WhatsApp template
    const isSlotEvent =
      event.type === "referee.slots.needed" || event.type === "referee.slots.reminder";

    const publicUrl = env.TRUSTED_ORIGINS[0] ?? "http://localhost:3000";
    const text = isSlotEvent
      ? renderRefereeSlotsWhatsApp(payload as unknown as RefereeSlotsPayload, publicUrl)
      : `*${message.title}*\n\n${message.body}`;

    const sendResult = await whatsAppGroupAdapter.send(
      {
        eventId: event.id,
        watchRuleId,
        channelConfigId: config.id,
        recipientId,
        title: message.title,
        body: text,
        locale,
      },
      groupChatId,
    );
    return sendResult.success;
  }

  if (channelType === "push") {
    const userIds = await resolveRecipientUserIds(recipientId);
    if (userIds.length === 0) return false;
    const sendResult = await pushAdapter.send({
      eventId: event.id,
      eventType: event.type,
      payload,
      watchRuleId,
      channelConfigId: config.id,
      recipientUserIds: userIds,
    });
    return sendResult.success;
  }

  logger.warn({ channelType, channelConfigId: config.id }, "Unknown channel type, skipping dispatch");
  return false;
}

/**
 * Claim the coalescing slot for ONE dispatch target and deliver it.
 *
 * The claim is per (event, channel config, channel, recipient) — the same
 * granularity as the in-run `dedupKey` — not per event. That is what makes a
 * partially-failed attempt resumable: a retry re-delivers exactly the targets
 * that never went out, while the ones that already landed stay claimed and are
 * not sent twice.
 *
 * `SET NX` is still taken *before* the attempt, so two concurrent workers
 * handling duplicate events cannot both dispatch. The claim is then released in
 * a `finally` whenever delivery did not succeed — including when
 * `dispatchImmediate` throws, which is the case the old release path was
 * written for but could never reach (it ran only on the success path, after the
 * throw had already unwound out of the pipeline). Wrapping the whole call also
 * makes every throw site inside `dispatchImmediate` safe, including
 * `resolveLocaleForRecipient` and the push adapter's reads.
 *
 * Returns "coalesced" when another attempt or a duplicate event holds the slot,
 * "dispatched" on delivery, "failed" when the adapter reported failure.
 */
async function claimAndDispatch(params: {
  event: DomainEventRow;
  config: { id: number; type: string; config: unknown };
  watchRuleId: number | null;
  recipientId: string;
  channelType: string;
  dedupKey: string;
}): Promise<"dispatched" | "failed" | "coalesced"> {
  const { event, dedupKey, ...target } = params;
  const coalesceKey = `coalesce:${event.type}:${event.entityType}:${event.entityId}:${dedupKey}`;

  const claim = await getRedis().set(coalesceKey, "1", "EX", COALESCE_WINDOW_SEC, "NX");
  if (claim !== "OK") return "coalesced";

  let sent = false;
  try {
    sent = await dispatchImmediate({ event, ...target });
    return sent ? "dispatched" : "failed";
  } finally {
    if (!sent) {
      try {
        await getRedis().del(coalesceKey);
      } catch (err) {
        // Never let the release failure mask the dispatch error that is
        // unwinding; the key expires on its own within the window.
        logger.warn({ coalesceKey, err }, "Failed to release coalesce claim");
      }
    }
  }
}

// ── Main pipeline ────────────────────────────────────────────────────────────

/**
 * Process a domain event through the notification pipeline.
 *
 * Steps:
 * 1. Load rules and channel configs
 * 2. Evaluate watch rules (condition matching)
 * 3. Evaluate role-based defaults
 * 4. Load muted event types for targeted recipients
 * 5. Buffer for digest (unless muted)
 * 6. Claim the per-target coalescing slot and dispatch immediate notifications
 *    (unless muted or coalesced)
 */
export async function processEvent(event: DomainEventRow): Promise<PipelineResult> {
  const result: PipelineResult = { dispatched: 0, buffered: 0, coalesced: 0, muted: 0, configs: [] };
  const dispatched = new Set<string>();

  // Step 1: Load rules and configs
  const { rules, configs } = await loadRulesAndConfigs();
  const configById = new Map(configs.map((c) => [c.id, c]));
  result.configs = configs;

  // Step 2: Evaluate watch rules
  const ruleMatches = evaluateWatchRules(event, rules, configById);

  // Step 3: Evaluate role-based defaults
  const defaultMatches = evaluateDefaults(event, configs);

  // Step 4: Load muted event types for all targeted recipients
  const allRecipientIds = defaultMatches.map((m) => m.recipientId);
  const mutedMap = await loadMutedEventTypes(allRecipientIds);

  // Coalescing is claimed per dispatch target inside claimAndDispatch below.
  // The key is on the event type, entity and target — without the event type,
  // two distinct events on the same entity within the window (e.g. schedule +
  // venue change from one admin edit) collide and the second is dropped (a
  // push-only default never reaches digest); without the target, a single
  // channel failing takes every other channel's notification down with it.

  // Process watch rule matches (watch rules are not subject to user muting —
  // they are admin-configured and always apply)
  for (const match of ruleMatches) {
    if (dispatched.has(match.dedupKey)) continue;
    dispatched.add(match.dedupKey);

    // Always buffer for digest
    await bufferForDigest(event.id, match.config.id);
    result.buffered++;

    // Dispatch immediately if urgent (or in_app, which has no delivery cost) and not coalesced
    const shouldDispatchRule = match.urgency === "immediate" || match.channelTarget.channel === "in_app";
    if (shouldDispatchRule) {
      const outcome = await claimAndDispatch({
        event,
        config: match.config,
        watchRuleId: match.watchRuleId,
        recipientId: watchRuleRecipientId(match.config),
        channelType: match.channelTarget.channel,
        dedupKey: match.dedupKey,
      });
      if (outcome === "coalesced") result.coalesced++;
      else if (outcome === "dispatched") result.dispatched++;
    }
  }

  // Process role-based defaults (subject to user muting)
  for (const match of defaultMatches) {
    if (dispatched.has(match.dedupKey)) continue;
    dispatched.add(match.dedupKey);

    // Check if recipient has muted this event type
    const recipientMuted = mutedMap.get(match.recipientId);
    if (recipientMuted?.has(event.type)) {
      result.muted++;
      continue; // skip both buffering and dispatch
    }

    // Always buffer for digest
    await bufferForDigest(event.id, match.config.id);
    result.buffered++;

    // Dispatch immediately if urgent (or in_app, which has no delivery cost) and not coalesced
    const shouldDispatchDefault = match.urgency === "immediate" || match.config.type === "in_app";
    if (shouldDispatchDefault) {
      const outcome = await claimAndDispatch({
        event,
        config: match.config,
        watchRuleId: null,
        recipientId: match.recipientId,
        channelType: match.config.type,
        dedupKey: match.dedupKey,
      });
      if (outcome === "coalesced") result.coalesced++;
      else if (outcome === "dispatched") result.dispatched++;
    }
  }

  return result;
}

export { loadRulesAndConfigs };
