import { describe, expect, it } from "vitest";
import type { BoardColumnData, BoardData } from "@dragons/shared";

import { sortedColumns } from "@/lib/board/columns";

const column = (id: number, position: number): BoardColumnData => ({
  id,
  name: `Column ${id}`,
  position,
  color: null,
  isDoneColumn: false,
});

const board = (columns: BoardColumnData[]): BoardData => ({
  id: 7,
  name: "Season",
  description: null,
  createdBy: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  columns,
});

describe("sortedColumns", () => {
  it("orders the columns by position", () => {
    const columns = sortedColumns(board([column(3, 2), column(1, 0), column(2, 1)]));

    expect(columns.map((c) => c.id)).toEqual([1, 2, 3]);
  });

  // The array is the SWR cache's; sorting it in place would reorder the board
  // under every other screen reading the same key.
  it("leaves the board's own array untouched", () => {
    const original = [column(3, 2), column(1, 0)];

    sortedColumns(board(original));

    expect(original.map((c) => c.id)).toEqual([3, 1]);
  });

  // A sheet route renders before its board has loaded.
  it("has no columns for a board that is not loaded yet", () => {
    expect(sortedColumns(undefined)).toEqual([]);
  });
});
