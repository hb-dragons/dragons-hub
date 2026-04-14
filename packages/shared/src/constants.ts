// ── Enums ────────────────────────────────────────────────────────────────────

export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const BOOKING_STATUSES = [
  "pending",
  "requested",
  "confirmed",
  "cancelled",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const SYNC_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export const ENTITY_TYPES = [
  "league",
  "match",
  "standing",
  "team",
  "venue",
  "referee",
  "refereeRole",
  "refereeGame",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const ENTRY_ACTIONS = [
  "created",
  "updated",
  "skipped",
  "failed",
] as const;
export type EntryAction = (typeof ENTRY_ACTIONS)[number];

export const DIFF_STATUSES = ["diverged", "synced", "local-only"] as const;
export type DiffStatus = (typeof DIFF_STATUSES)[number];

// ── Validation Patterns ─────────────────────────────────────────────────────

/** Matches YYYY-MM-DD */
export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Matches HH:MM or HH:MM:SS */
export const TIME_REGEX = /^\d{2}:\d{2}(:\d{2})?$/;
