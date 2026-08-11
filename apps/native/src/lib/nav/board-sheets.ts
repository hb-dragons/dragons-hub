import { router, type Href } from "expo-router";
import type { BoardSortMode, TaskPriority } from "@dragons/shared";
import { formatIdList } from "@/lib/nav/route-params";
import { createSheetResult } from "./sheet-result";

/**
 * How a screen opens one of the board's route sheets (issue #219).
 *
 * The path and the param names for each sheet live here and nowhere else, so
 * the board screen, the task detail body and quick create all agree on them by
 * construction. The conventions these follow — scalar params, and a sheet
 * either owning a mutation or returning a value — are written down in
 * `sheet-routes.ts`.
 */

/**
 * Each sheet is pushed as a literal `{ pathname, params }` href.
 *
 * Two things follow from #217's typed-href rule. The path is written out rather
 * than interpolated from `SHEET_ROUTE_PREFIX`, because a route is only
 * compile-checked where the literal is written — an interpolated path is a
 * `string`, which is why this file used to need an `as Href` cast. And the href
 * is built at the call site rather than from a `(pathname, params)` pair,
 * because `Href`'s object form is a discriminated union: a dynamic route binds
 * its own param names, so only a concrete pathname selects a member of it.
 */
function openSheet(href: Href): void {
  router.push(href);
}

// ---------------------------------------------------------------------------
// Sheets that return a value
// ---------------------------------------------------------------------------

export function openSortSheet(
  current: BoardSortMode,
  onPick: (next: BoardSortMode) => void,
): void {
  openSheet({
    pathname: "/admin/boards/sheets/sort",
    params: { current, result: createSheetResult(onPick) },
  });
}

export function openPriorityPickerSheet(
  current: TaskPriority,
  onPick: (next: TaskPriority) => void,
): void {
  openSheet({
    pathname: "/admin/boards/sheets/priority",
    params: { current, result: createSheetResult(onPick) },
  });
}

/** `current` and the delivered value are YYYY-MM-DD — the server's date column. */
export function openDuePickerSheet(
  current: string | null,
  onPick: (next: string | null) => void,
): void {
  // Left out rather than sent as "null": the route treats an absent `current`
  // as "no due date yet" and opens on today.
  openSheet({
    pathname: "/admin/boards/sheets/due",
    params: { current: current ?? undefined, result: createSheetResult(onPick) },
  });
}

/**
 * Multi-select over the user directory. The sheet batches locally and delivers
 * the final set once; the caller diffs it against what the task had and runs
 * the add/remove mutations.
 */
export function openAssigneePickerSheet(
  selected: Iterable<string>,
  onApply: (next: Set<string>) => void | Promise<void>,
): void {
  openSheet({
    pathname: "/admin/boards/sheets/assignees",
    params: {
      selected: formatIdList(selected),
      // `onApply` runs the assignment mutations, which report their own
      // failures; nothing here awaits the result.
      result: createSheetResult<Set<string>>((next) => void onApply(next)),
    },
  });
}

/** Same control as the assignee picker, but scoped to the board's filter. */
export function openAssigneeFilterSheet(
  selected: Iterable<string>,
  onApply: (next: Set<string>) => void,
): void {
  openSheet({
    pathname: "/admin/boards/sheets/assignee-filter",
    params: {
      selected: formatIdList(selected),
      result: createSheetResult(onApply),
    },
  });
}

// ---------------------------------------------------------------------------
// Sheets that own their mutation
// ---------------------------------------------------------------------------

/** The task's own sheet: edits, checklist and comments (#222). */
export function openTaskDetailSheet(boardId: number, taskId: number): void {
  openSheet({ pathname: "/admin/boards/sheets/task-detail", params: { boardId, taskId } });
}

/** `columnId` is the column the new task lands in unless the user picks another. */
export function openQuickCreateSheet(boardId: number, columnId: number): void {
  openSheet({ pathname: "/admin/boards/sheets/quick-create", params: { boardId, columnId } });
}

export function openMoveToSheet(boardId: number, taskId: number): void {
  openSheet({ pathname: "/admin/boards/sheets/move-to", params: { boardId, taskId } });
}

export function openAddColumnSheet(boardId: number): void {
  openSheet({ pathname: "/admin/boards/sheets/add-column", params: { boardId } });
}

export function openBoardSettingsSheet(boardId: number): void {
  openSheet({ pathname: "/admin/boards/sheets/board-settings", params: { boardId } });
}

export function openColumnSettingsSheet(boardId: number, columnId: number): void {
  openSheet({ pathname: "/admin/boards/sheets/column-settings", params: { boardId, columnId } });
}
