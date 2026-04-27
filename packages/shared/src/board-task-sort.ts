/**
 * Pure comparator factory for the native kanban board's sort options.
 * The native side keeps tasks per-column; this comparator runs after the
 * column slice so it sorts within a column.
 *
 * `updatedAt` is optional on TaskCardData — older API responses may omit
 * it. The comparator treats missing values as "older than everything"
 * for `updated-desc`.
 */

import type { TaskCardData } from "./tasks";
import type { TaskPriority } from "./constants";

export type BoardSortMode =
  | "position"
  | "due-asc"
  | "due-desc"
  | "priority-desc"
  | "updated-desc";

const PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

type WithUpdated = TaskCardData & { updatedAt?: string };

function tieBreak(a: TaskCardData, b: TaskCardData): number {
  return a.id - b.id;
}

export function boardTaskComparator(
  mode: BoardSortMode,
): (a: TaskCardData, b: TaskCardData) => number {
  switch (mode) {
    case "position":
      return (a, b) => {
        const d = a.position - b.position;
        return d !== 0 ? d : tieBreak(a, b);
      };
    case "due-asc":
      return (a, b) => {
        if (a.dueDate == null && b.dueDate == null) return tieBreak(a, b);
        if (a.dueDate == null) return 1;
        if (b.dueDate == null) return -1;
        const d = Date.parse(a.dueDate) - Date.parse(b.dueDate);
        return d !== 0 ? d : tieBreak(a, b);
      };
    case "due-desc":
      return (a, b) => {
        if (a.dueDate == null && b.dueDate == null) return tieBreak(a, b);
        if (a.dueDate == null) return 1;
        if (b.dueDate == null) return -1;
        const d = Date.parse(b.dueDate) - Date.parse(a.dueDate);
        return d !== 0 ? d : tieBreak(a, b);
      };
    case "priority-desc":
      return (a, b) => {
        const d = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        return d !== 0 ? d : tieBreak(a, b);
      };
    case "updated-desc":
      return (a, b) => {
        const au = (a as WithUpdated).updatedAt;
        const bu = (b as WithUpdated).updatedAt;
        if (au == null && bu == null) return tieBreak(a, b);
        if (au == null) return 1;
        if (bu == null) return -1;
        const d = Date.parse(bu) - Date.parse(au);
        return d !== 0 ? d : tieBreak(a, b);
      };
  }
}
