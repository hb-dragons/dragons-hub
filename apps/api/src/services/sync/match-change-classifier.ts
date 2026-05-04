import { EVENT_TYPES } from "@dragons/shared";

type FieldValue = string | number | boolean | null | undefined;

export interface FieldChange {
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
}

function stringify(v: FieldValue): string | null {
  return v === null || v === undefined ? null : String(v);
}

function normalizeTime(v: string | null): string | null {
  return v !== null ? v.replace(/^(\d{2}:\d{2}):00$/, "$1") : v;
}

export function detectFieldChanges<
  E extends Record<string, FieldValue>,
  S extends Record<string, FieldValue>,
>(existing: E, snapshot: S, fields: readonly (keyof E & keyof S & string)[]): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const name of fields) {
    let oldStr = stringify(existing[name]);
    let newStr = stringify(snapshot[name]);
    if (name === "kickoffTime") {
      oldStr = normalizeTime(oldStr);
      newStr = normalizeTime(newStr);
    }
    if (oldStr !== newStr) {
      changes.push({ fieldName: name, oldValue: oldStr, newValue: newStr });
    }
  }
  return changes;
}

export function computeEffectiveChanges<E extends Record<string, FieldValue>>(
  locked: E,
  updateSet: Record<string, unknown>,
  fields: readonly string[],
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of fields) {
    if (!(field in updateSet)) continue;
    let oldStr = stringify(locked[field as keyof E]);
    let newStr = stringify(updateSet[field] as FieldValue);
    if (field === "kickoffTime") {
      oldStr = normalizeTime(oldStr);
      newStr = normalizeTime(newStr);
    }
    if (oldStr !== newStr) {
      changes.push({ fieldName: field, oldValue: oldStr, newValue: newStr });
    }
  }
  return changes;
}

export function classifyMatchChanges(effectiveChanges: FieldChange[]): string[] {
  const eventTypes: string[] = [];
  const changedFields = new Set(effectiveChanges.map((c) => c.fieldName));

  if (changedFields.has("isCancelled")) {
    const change = effectiveChanges.find((c) => c.fieldName === "isCancelled");
    if (change?.newValue === "true") eventTypes.push(EVENT_TYPES.MATCH_CANCELLED);
  }

  if (changedFields.has("isForfeited")) {
    const change = effectiveChanges.find((c) => c.fieldName === "isForfeited");
    if (change?.newValue === "true") eventTypes.push(EVENT_TYPES.MATCH_FORFEITED);
  }

  if (changedFields.has("isConfirmed")) {
    const change = effectiveChanges.find((c) => c.fieldName === "isConfirmed");
    if (change?.newValue === "true") eventTypes.push(EVENT_TYPES.MATCH_CONFIRMED);
  }

  if (changedFields.has("kickoffDate") || changedFields.has("kickoffTime")) {
    eventTypes.push(EVENT_TYPES.MATCH_SCHEDULE_CHANGED);
  }

  if (changedFields.has("venueId")) {
    eventTypes.push(EVENT_TYPES.MATCH_VENUE_CHANGED);
  }

  if (changedFields.has("homeScore") || changedFields.has("guestScore")) {
    const homeChange = effectiveChanges.find((c) => c.fieldName === "homeScore");
    const guestChange = effectiveChanges.find((c) => c.fieldName === "guestScore");
    const hadScore =
      (homeChange?.oldValue != null && homeChange.oldValue !== "null") ||
      (guestChange?.oldValue != null && guestChange.oldValue !== "null");

    eventTypes.push(hadScore ? EVENT_TYPES.MATCH_RESULT_CHANGED : EVENT_TYPES.MATCH_RESULT_ENTERED);
  }

  return eventTypes;
}
