import { router, type Href } from "expo-router";
import type { BoardSortMode, TaskPriority } from "@dragons/shared";
import { formatIdList } from "@/lib/board/sheet-params";
import { createSheetResult } from "./sheet-result";
import { SHEET_ROUTE_PREFIX } from "./sheet-routes";

/**
 * How a screen opens one of the board's route sheets (issue #219).
 *
 * The path and the param names for each sheet live here and nowhere else, so
 * the board screen, the task detail body and quick create all agree on them by
 * construction. The conventions these follow — scalar params, and a sheet
 * either owning a mutation or returning a value — are written down in
 * `sheet-routes.ts`.
 */

type SheetParams = Record<string, string | number | undefined>;

function openSheet(name: string, params: SheetParams): void {
  router.push({ pathname: `${SHEET_ROUTE_PREFIX}/${name}`, params } as Href);
}

// ---------------------------------------------------------------------------
// Sheets that return a value
// ---------------------------------------------------------------------------

export function openSortSheet(
  current: BoardSortMode,
  onPick: (next: BoardSortMode) => void,
): void {
  openSheet("sort", { current, result: createSheetResult(onPick) });
}

export function openPriorityPickerSheet(
  current: TaskPriority,
  onPick: (next: TaskPriority) => void,
): void {
  openSheet("priority", { current, result: createSheetResult(onPick) });
}

/** `current` and the delivered value are YYYY-MM-DD — the server's date column. */
export function openDuePickerSheet(
  current: string | null,
  onPick: (next: string | null) => void,
): void {
  // Left out rather than sent as "null": the route treats an absent `current`
  // as "no due date yet" and opens on today.
  openSheet("due", { current: current ?? undefined, result: createSheetResult(onPick) });
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
  openSheet("assignees", {
    selected: formatIdList(selected),
    // `onApply` runs the assignment mutations, which report their own
    // failures; nothing here awaits the result.
    result: createSheetResult<Set<string>>((next) => void onApply(next)),
  });
}

/** Same control as the assignee picker, but scoped to the board's filter. */
export function openAssigneeFilterSheet(
  selected: Iterable<string>,
  onApply: (next: Set<string>) => void,
): void {
  openSheet("assignee-filter", {
    selected: formatIdList(selected),
    result: createSheetResult(onApply),
  });
}

// ---------------------------------------------------------------------------
// Sheets that own their mutation
// ---------------------------------------------------------------------------

export function openMoveToSheet(boardId: number, taskId: number): void {
  openSheet("move-to", { boardId, taskId });
}

export function openAddColumnSheet(boardId: number): void {
  openSheet("add-column", { boardId });
}

export function openBoardSettingsSheet(boardId: number): void {
  openSheet("board-settings", { boardId });
}

export function openColumnSettingsSheet(boardId: number, columnId: number): void {
  openSheet("column-settings", { boardId, columnId });
}
