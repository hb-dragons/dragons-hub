/**
 * Pure (de)serialisation for the native kanban board's filter state.
 * Lives in @dragons/shared so it can be unit-tested under vitest.
 *
 * The native app reads/writes the serialised string via expo-secure-store
 * (AsyncStorage isn't installed in apps/native).
 */

import { TASK_PRIORITIES, type TaskPriority } from "./constants";

export interface SerialisableBoardFilters {
  mine: boolean;
  priority: TaskPriority | null;
  dueSoon: boolean;
  unassigned: boolean;
  assigneeIds: Set<string>;
}

interface Wire {
  mine: boolean;
  priority: TaskPriority | null;
  dueSoon: boolean;
  unassigned: boolean;
  assigneeIds: string[];
}

const DEFAULTS: SerialisableBoardFilters = {
  mine: false,
  priority: null,
  dueSoon: false,
  unassigned: false,
  assigneeIds: new Set<string>(),
};

function isPriority(value: unknown): value is TaskPriority {
  return (
    typeof value === "string" &&
    (TASK_PRIORITIES as readonly string[]).includes(value)
  );
}

export function serializeFilters(filters: SerialisableBoardFilters): string {
  const wire: Wire = {
    mine: filters.mine,
    priority: filters.priority,
    dueSoon: filters.dueSoon,
    unassigned: filters.unassigned,
    assigneeIds: [...filters.assigneeIds],
  };
  return JSON.stringify(wire);
}

export function parseFilters(input: string | null): SerialisableBoardFilters {
  if (input == null) return cloneDefaults();
  let raw: unknown;
  try {
    raw = JSON.parse(input);
  } catch {
    return cloneDefaults();
  }
  if (!raw || typeof raw !== "object") return cloneDefaults();
  const r = raw as Partial<Wire>;
  return {
    mine: typeof r.mine === "boolean" ? r.mine : false,
    priority: r.priority == null ? null : isPriority(r.priority) ? r.priority : null,
    dueSoon: typeof r.dueSoon === "boolean" ? r.dueSoon : false,
    unassigned: typeof r.unassigned === "boolean" ? r.unassigned : false,
    assigneeIds: new Set(
      Array.isArray(r.assigneeIds)
        ? r.assigneeIds.filter((s): s is string => typeof s === "string")
        : [],
    ),
  };
}

function cloneDefaults(): SerialisableBoardFilters {
  return {
    ...DEFAULTS,
    assigneeIds: new Set<string>(),
  };
}
