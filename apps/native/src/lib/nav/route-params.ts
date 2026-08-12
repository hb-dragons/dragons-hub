import { TASK_PRIORITIES, type BoardSortMode, type TaskPriority } from "@dragons/shared";

/**
 * Reading a sheet route's params (issue #219).
 *
 * A sheet that is a route takes its input from the URL, which means every
 * value arrives as a string, may be repeated (expo-router types params as
 * `string | string[]`), and may be absent. Each sheet route reads its params
 * through these so the fallbacks are stated once.
 *
 * Lived under `lib/board/` until #223, when the referee-assignment sheet — the
 * first route sheet outside the board — needed the same reading. Nothing here
 * was ever board-specific beyond the sort/priority vocabularies.
 */

export type RouteParam = string | string[] | undefined;

/** First value of a param, treating a repeated key as "the first one wins". */
function first(param: RouteParam): string | undefined {
  return Array.isArray(param) ? param[0] : param;
}

export const SORT_MODES: readonly BoardSortMode[] = [
  "position",
  "due-asc",
  "due-desc",
  "priority-desc",
  "updated-desc",
];

export function parseSortMode(param: RouteParam): BoardSortMode {
  const value = first(param);
  return SORT_MODES.find((mode) => mode === value) ?? "position";
}

export function parsePriority(param: RouteParam): TaskPriority {
  const value = first(param);
  return TASK_PRIORITIES.find((priority) => priority === value) ?? "normal";
}

/** Comma-joined user ids, as the assignee sheets pass them. */
export function formatIdList(ids: Iterable<string>): string {
  return [...ids].join(",");
}

export function parseIdSet(param: RouteParam): Set<string> {
  const value = first(param);
  if (!value) return new Set();
  return new Set(value.split(",").filter((id) => id.length > 0));
}

/** A numeric id param, or `null` when it is missing or not a number. */
export function parseNumericParam(param: RouteParam): number | null {
  const value = first(param);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
