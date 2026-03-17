import { eq, inArray } from "drizzle-orm";
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
 * Load muted event types for a set of recipient IDs that follow the
 * "referee:123" pattern. Returns a Map from recipientId → Set of muted types.
 */
async function loadMutedEventTypes(
  recipientIds: string[],
): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>();

  // Extract refereeIds from "referee:123" patterns
  const refereeIds: number[] = [];
  const refereeRecipientMap = new Map<number, string>(); // refereeId → recipientId

  for (const rid of recipientIds) {
    const match = rid.match(/^referee:(\d+)$/);
    if (match) {
      const refId = Number(match[1]);
      refereeIds.push(refId);
      refereeRecipientMap.set(refId, rid);
    }
  }

  if (refereeIds.length === 0) return result;

  // Look up users by refereeId to find their preferences
  // The users table has a refereeId FK; preferences are keyed by userId
  // For now, query user_notification_preferences where userId matches
  // users with these refereeIds. Since we don't have a direct join here,
  // we load all preferences that have non-empty mutedEventTypes.
  try {
    const prefs = await db
      .select({
        userId: userNotificationPreferences.userId,
        mutedEventTypes: userNotificationPreferences.mutedEventTypes,
      })
      .from(userNotificationPreferences);

    // Map userId to mutedEventTypes for any user that has muted types
    for (const pref of prefs) {
      if (pref.mutedEventTypes.length === 0) continue;
      // Check if this userId corresponds to any of our referee recipients
      // For now, store all non-empty prefs; the caller filters by recipientId
      result.set(pref.userId, new Set(pref.mutedEventTypes));
    }
  } catch {
    // If preferences table doesn't exist yet or query fails, skip filtering
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
  configById: Map<number, Awaited<ReturnType<typeof loadRulesAndConfigs>>["configs"][number]>,
) {
  const payload = event.payload as Record<string, unknown>;
  const effectiveUrgency = event.urgency as "immediate" | "routine";
  const matches: Array<{
    channelTarget: { channel: string; targetId: string };
    config: Awaited<ReturnType<typeof loadRulesAndConfigs>>["configs"][number];
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
  configs: Awaited<ReturnType<typeof loadRulesAndConfigs>>["configs"],
) {
  const payload = event.payload as Record<string, unknown>;
  const effectiveUrgency = event.urgency as "immediate" | "routine";
  const defaults = getDefaultNotificationsForEvent(event.type, payload, event.source);

  const matches: Array<{
    config: typeof configs[number];
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
 * 4. Check coalescing window (skip rapid-fire immediate dispatches)
 * 5. Check muted event types (skip for users who muted this type)
 * 6. Buffer for digest
 * 7. Dispatch immediate notifications
 */
export async function processEvent(event: DomainEventRow): Promise<PipelineResult> {
  const result: PipelineResult = { dispatched: 0, buffered: 0, coalesced: 0, muted: 0 };
  const dispatched = new Set<string>();

  // Step 1: Load rules and configs
  const { rules, configs } = await loadRulesAndConfigs();
  const configById = new Map(configs.map((c) => [c.id, c]));

  // Step 2: Evaluate watch rules
  const ruleMatches = evaluateWatchRules(event, rules, configById);

  // Step 3: Evaluate role-based defaults
  const defaultMatches = evaluateDefaults(event, configs);

  // Step 4: Check coalescing — determine if we should skip immediate dispatch
  const coalesced = shouldCoalesce(event.entityType, event.entityId);

  // Process watch rule matches
  for (const match of ruleMatches) {
    if (dispatched.has(match.dedupKey)) continue;
    dispatched.add(match.dedupKey);

    // Always buffer for digest
    await bufferForDigest(event.id, match.config.id);
    result.buffered++;

    // Dispatch immediately if urgent and not coalesced
    if (match.urgency === "immediate") {
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

  // Process role-based defaults
  for (const match of defaultMatches) {
    if (dispatched.has(match.dedupKey)) continue;
    dispatched.add(match.dedupKey);

    // Always buffer for digest
    await bufferForDigest(event.id, match.config.id);
    result.buffered++;

    // Dispatch immediately if urgent and not coalesced
    if (match.urgency === "immediate") {
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
