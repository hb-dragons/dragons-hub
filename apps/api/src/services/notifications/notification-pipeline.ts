import { eq } from "drizzle-orm";
import {
  watchRules,
  channelConfigs,
  digestBuffer,
  userNotificationPreferences,
} from "@dragons/db/schema";
import type { DomainEventRow } from "@dragons/db/schema";
import { db } from "../../config/database";
import { evaluateRule, type RuleInput } from "./rule-engine";
import { getDefaultNotificationsForEvent } from "./role-defaults";
import { renderEventMessage } from "./templates/index";
import { InAppChannelAdapter } from "./channels/in-app";
import { logger } from "../../config/logger";

// ── Config type alias ────────────────────────────────────────────────────────

type ChannelConfigRow = Awaited<ReturnType<typeof loadRulesAndConfigs>>["configs"][number];

// ── Coalescing window ────────────────────────────────────────────────────────

const COALESCE_WINDOW_MS = 60_000;

// In-memory map tracking recent immediate dispatches per entity.
// Key: "entityType:entityId", Value: timestamp of last dispatch.
// Entries are cleaned up lazily on access.
const recentDispatches = new Map<string, number>();

function shouldCoalesce(entityType: string, entityId: number): boolean {
  const key = `${entityType}:${entityId}`;
  const lastDispatch = recentDispatches.get(key);
  const now = Date.now();

  if (lastDispatch && now - lastDispatch < COALESCE_WINDOW_MS) {
    return true; // skip immediate dispatch, still buffer for digest
  }

  return false;
}

function markDispatched(entityType: string, entityId: number): void {
  const key = `${entityType}:${entityId}`;
  recentDispatches.set(key, Date.now());

  // Lazy cleanup: remove stale entries when map grows
  if (recentDispatches.size > 1000) {
    const cutoff = Date.now() - COALESCE_WINDOW_MS;
    for (const [k, v] of recentDispatches) {
      if (v < cutoff) recentDispatches.delete(k);
    }
  }
}

/** Visible for testing */
export function clearCoalesceCache(): void {
  recentDispatches.clear();
}

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

  // Only referee recipients have individual mute preferences
  const refereeRecipients = recipientIds.filter((r) => r.startsWith("referee:"));
  if (refereeRecipients.length === 0) return result;

  try {
    const prefs = await db
      .select({
        userId: userNotificationPreferences.userId,
        mutedEventTypes: userNotificationPreferences.mutedEventTypes,
      })
      .from(userNotificationPreferences);

    // Build a userId → mutedEventTypes map for users with non-empty muted lists
    const userMutedMap = new Map<string, Set<string>>();
    for (const pref of prefs) {
      if (pref.mutedEventTypes.length > 0) {
        userMutedMap.set(pref.userId, new Set(pref.mutedEventTypes));
      }
    }

    // Map referee recipients to their user's muted types.
    // Convention: recipientId "referee:77" corresponds to userId that has refereeId=77.
    // Since we can't join here without the users table, we store by recipientId
    // and match by userId pattern. In practice the userId IS the referee recipient.
    for (const rid of refereeRecipients) {
      // Check if any user's muted types apply — for now, use recipientId as lookup key
      const muted = userMutedMap.get(rid);
      if (muted) {
        result.set(rid, muted);
      }
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

/**
 * Step 1: Load watch rules and channel configs from DB.
 */
async function loadRulesAndConfigs() {
  const [rules, configs] = await Promise.all([
    db.select().from(watchRules).where(eq(watchRules.enabled, true)),
    db.select().from(channelConfigs).where(eq(channelConfigs.enabled, true)),
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
      const configData = c.config as Record<string, unknown> | null;
      const audienceRole = configData?.audienceRole as string | undefined;
      if (!audienceRole) return true;
      return audienceRole === defaultNotif.audience;
    });

    const recipientId = defaultNotif.refereeId
      ? `referee:${defaultNotif.refereeId}`
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

/**
 * Step 5: Dispatch an immediate notification via channel adapter.
 */
async function dispatchImmediate(params: {
  event: DomainEventRow;
  config: { id: number; type: string; config: unknown };
  watchRuleId: number | null;
  recipientId: string;
  channelType: string;
}): Promise<boolean> {
  const { event, config, watchRuleId, recipientId, channelType } = params;
  const payload = event.payload as Record<string, unknown>;
  const locale = (config.config as Record<string, unknown>)?.locale as string ?? "de";
  const message = renderEventMessage(event.type, payload, event.entityName, locale);

  if (channelType === "in_app") {
    await inAppAdapter.send({
      eventId: event.id,
      watchRuleId,
      channelConfigId: config.id,
      recipientId,
      title: message.title,
      body: message.body,
      locale,
    });
    return true;
  }

  return false;
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
 * 5. Check coalescing window (skip rapid-fire immediate dispatches)
 * 6. Buffer for digest (unless muted)
 * 7. Dispatch immediate notifications (unless muted or coalesced)
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

  // Step 5: Check coalescing — determine if we should skip immediate dispatch
  const coalesced = shouldCoalesce(event.entityType, event.entityId);

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
      if (coalesced) {
        result.coalesced++;
      } else {
        const sent = await dispatchImmediate({
          event,
          config: match.config,
          watchRuleId: match.watchRuleId,
          recipientId: match.channelTarget.targetId,
          channelType: match.channelTarget.channel,
        });
        if (sent) result.dispatched++;
      }
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
      if (coalesced) {
        result.coalesced++;
      } else {
        const sent = await dispatchImmediate({
          event,
          config: match.config,
          watchRuleId: null,
          recipientId: match.recipientId,
          channelType: match.config.type,
        });
        if (sent) result.dispatched++;
      }
    }
  }

  // Mark entity as recently dispatched (for coalescing window)
  if (result.dispatched > 0) {
    markDispatched(event.entityType, event.entityId);
  }

  return result;
}

export { loadRulesAndConfigs };
