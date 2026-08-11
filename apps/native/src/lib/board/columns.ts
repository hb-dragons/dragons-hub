import type { BoardColumnData, BoardData } from "@dragons/shared";

/**
 * A board's columns in display order.
 *
 * `position` is the order the API stores, not the order the array arrives in,
 * so every surface that draws the columns — the board screen, the move-to and
 * quick-create sheets — sorts them. Copies first: the array belongs to the SWR
 * cache, and sorting in place would reorder it under everything else reading
 * the same board.
 */
export function sortedColumns(board: BoardData | undefined): BoardColumnData[] {
  return board ? [...board.columns].sort((a, b) => a.position - b.position) : [];
}
