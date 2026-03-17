import type {
  FilterConditionRow,
  ChannelTargetRow,
} from "@dragons/db/schema";

// ── Types ───────────────────────────────────────────────────────────────────

export interface RuleInput {
  eventTypes: string[];
  filters: FilterConditionRow[];
  channels: ChannelTargetRow[];
  urgencyOverride?: string | null;
  enabled: boolean;
}

export interface RuleResult {
  matched: boolean;
  channels: ChannelTargetRow[];
  urgencyOverride: string | null;
}

const NO_MATCH: RuleResult = {
  matched: false,
  channels: [],
  urgencyOverride: null,
};

// ── matchesEventType ────────────────────────────────────────────────────────

/**
 * Check whether a pattern matches a given event type.
 *
 * Supports:
 * - Exact match: "match.cancelled" === "match.cancelled"
 * - Trailing wildcard: "match.*" matches "match.cancelled", "match.schedule.changed"
 * - Universal: "*" matches everything
 */
export function matchesEventType(pattern: string, eventType: string): boolean {
  if (pattern === "*") return true;
  if (pattern === eventType) return true;

  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -1); // keep the trailing dot: "match."
    return eventType.startsWith(prefix);
  }

  return false;
}

// ── evaluateFilter ──────────────────────────────────────────────────────────

/**
 * Evaluate a single filter condition against a payload.
 *
 * The `source` parameter is passed separately since it lives on the event
 * rather than inside the payload.
 */
export function evaluateFilter(
  filter: FilterConditionRow,
  payload: Record<string, unknown>,
  source?: string,
): boolean {
  if (filter.operator === "any") return true;

  const fieldValue = resolveFieldValue(filter.field, payload, source);

  switch (filter.operator) {
    case "eq":
      return matchesSingleValue(fieldValue, filter.value as string);

    case "neq":
      return !matchesSingleValue(fieldValue, filter.value as string);

    case "in": {
      const allowed = filter.value as string[];
      return matchesAnyInList(fieldValue, allowed);
    }

    default:
      return false;
  }
}

/**
 * Resolve the actual value(s) for a filter field from the payload or source.
 *
 * For `teamId`, we look up the `teamIds` array in the payload (since a match
 * can involve multiple teams).
 */
function resolveFieldValue(
  field: FilterConditionRow["field"],
  payload: Record<string, unknown>,
  source?: string,
): unknown {
  if (field === "source") return source;
  if (field === "teamId") return payload["teamIds"];
  return payload[field];
}

/**
 * Check if a resolved value matches a single expected string.
 *
 * When the resolved value is an array (e.g. teamIds), returns true if ANY
 * element equals the expected value.
 */
function matchesSingleValue(resolved: unknown, expected: string): boolean {
  if (Array.isArray(resolved)) {
    return resolved.some((v) => String(v) === expected);
  }
  return String(resolved) === expected;
}

/**
 * Check if a resolved value matches any string in a list.
 *
 * When the resolved value is an array, returns true if ANY element appears
 * in the allowed list.
 */
function matchesAnyInList(resolved: unknown, allowed: string[]): boolean {
  if (Array.isArray(resolved)) {
    return resolved.some((v) => allowed.includes(String(v)));
  }
  return allowed.includes(String(resolved));
}

// ── evaluateRule ────────────────────────────────────────────────────────────

/**
 * Evaluate a complete watch rule against an event.
 *
 * 1. Rule must be enabled
 * 2. At least one event-type pattern must match
 * 3. All filters must pass (AND logic)
 */
export function evaluateRule(
  rule: RuleInput,
  eventType: string,
  payload: Record<string, unknown>,
  source: string,
): RuleResult {
  if (!rule.enabled) return NO_MATCH;

  const typeMatched = rule.eventTypes.some((pattern) =>
    matchesEventType(pattern, eventType),
  );
  if (!typeMatched) return NO_MATCH;

  const filtersPass = rule.filters.every((f) =>
    evaluateFilter(f, payload, source),
  );
  if (!filtersPass) return NO_MATCH;

  return {
    matched: true,
    channels: rule.channels,
    urgencyOverride: rule.urgencyOverride ?? null,
  };
}
