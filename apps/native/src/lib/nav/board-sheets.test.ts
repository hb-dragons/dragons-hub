import { beforeEach, describe, expect, it, vi } from "vitest";
import { router } from "expo-router";

import {
  openAddColumnSheet,
  openAssigneeFilterSheet,
  openAssigneePickerSheet,
  openBoardSettingsSheet,
  openColumnSettingsSheet,
  openDuePickerSheet,
  openMoveToSheet,
  openPriorityPickerSheet,
  openSortSheet,
} from "@/lib/nav/board-sheets";
import {
  __resetSheetResultsForTests,
  deliverSheetResult,
  pendingSheetResultCount,
} from "@/lib/nav/sheet-result";

/**
 * The other half of the route-sheet convention: how a screen *opens* a sheet.
 * Every helper here is the only place that knows a sheet's path and param
 * names, so a rename is a one-file change rather than a search for string
 * literals across the board screen and two task surfaces.
 */

const pushed = (): { pathname: string; params: Record<string, unknown> } => {
  const push = vi.mocked(router.push);
  expect(push).toHaveBeenCalledTimes(1);
  return push.mock.calls[0]![0] as { pathname: string; params: Record<string, unknown> };
};

describe("board sheet navigation", () => {
  beforeEach(() => {
    vi.mocked(router.push).mockClear();
    __resetSheetResultsForTests();
  });

  describe("sheets that return a value", () => {
    it("opens the sort sheet with the current mode and delivers the pick", () => {
      const onPick = vi.fn();
      openSortSheet("due-asc", onPick);

      const { pathname, params } = pushed();
      expect(pathname).toBe("/admin/boards/sheets/sort");
      expect(params["current"]).toBe("due-asc");

      deliverSheetResult(params["result"] as string, "priority-desc");
      expect(onPick).toHaveBeenCalledExactlyOnceWith("priority-desc");
    });

    it("opens the priority picker with the current priority", () => {
      const onPick = vi.fn();
      openPriorityPickerSheet("high", onPick);

      const { pathname, params } = pushed();
      expect(pathname).toBe("/admin/boards/sheets/priority");
      expect(params["current"]).toBe("high");

      deliverSheetResult(params["result"] as string, "urgent");
      expect(onPick).toHaveBeenCalledExactlyOnceWith("urgent");
    });

    it("opens the due picker with the current date", () => {
      openDuePickerSheet("2026-08-11", vi.fn());

      const { pathname, params } = pushed();
      expect(pathname).toBe("/admin/boards/sheets/due");
      expect(params["current"]).toBe("2026-08-11");
    });

    // `current` is optional in the route, and an unset due date must not
    // arrive as the string "null".
    it("omits the current date when the task has none", () => {
      openDuePickerSheet(null, vi.fn());

      expect(pushed().params["current"]).toBeUndefined();
    });

    it("opens the assignee picker with the current selection", () => {
      const onApply = vi.fn();
      openAssigneePickerSheet(["u1", "u2"], onApply);

      const { pathname, params } = pushed();
      expect(pathname).toBe("/admin/boards/sheets/assignees");
      expect(params["selected"]).toBe("u1,u2");

      const next = new Set(["u3"]);
      deliverSheetResult(params["result"] as string, next);
      expect(onApply).toHaveBeenCalledExactlyOnceWith(next);
    });

    it("opens the assignee filter with the current selection", () => {
      openAssigneeFilterSheet(new Set(["u9"]), vi.fn());

      const { pathname, params } = pushed();
      expect(pathname).toBe("/admin/boards/sheets/assignee-filter");
      expect(params["selected"]).toBe("u9");
    });

    it("sends an empty selection as an empty string", () => {
      openAssigneeFilterSheet(new Set<string>(), vi.fn());

      expect(pushed().params["selected"]).toBe("");
    });

    it("registers exactly one result handler per open", () => {
      openSortSheet("position", vi.fn());

      expect(pendingSheetResultCount()).toBe(1);
    });
  });

  describe("sheets that own their mutation", () => {
    it("opens the move-to sheet with the board and task", () => {
      openMoveToSheet(7, 42);

      const { pathname, params } = pushed();
      expect(pathname).toBe("/admin/boards/sheets/move-to");
      expect(params).toEqual({ boardId: 7, taskId: 42 });
    });

    it("opens the add-column sheet with the board", () => {
      openAddColumnSheet(7);

      const { pathname, params } = pushed();
      expect(pathname).toBe("/admin/boards/sheets/add-column");
      expect(params).toEqual({ boardId: 7 });
    });

    it("opens the board settings sheet with the board", () => {
      openBoardSettingsSheet(7);

      const { pathname, params } = pushed();
      expect(pathname).toBe("/admin/boards/sheets/board-settings");
      expect(params).toEqual({ boardId: 7 });
    });

    it("opens the column settings sheet with the board and column", () => {
      openColumnSettingsSheet(7, 3);

      const { pathname, params } = pushed();
      expect(pathname).toBe("/admin/boards/sheets/column-settings");
      expect(params).toEqual({ boardId: 7, columnId: 3 });
    });

    // These sheets apply their own change and close; a result token would be
    // registered and never delivered.
    it("registers no result handler", () => {
      openAddColumnSheet(7);
      openBoardSettingsSheet(7);
      openColumnSettingsSheet(7, 3);
      openMoveToSheet(7, 42);

      expect(pendingSheetResultCount()).toBe(0);
    });
  });
});
