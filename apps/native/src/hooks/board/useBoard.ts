import useSWR from "swr";
import { adminBoardApi } from "@/lib/api";
import type { BoardData } from "@dragons/shared";

export const boardKey = (id: number) => `admin/boards/${id}`;

/**
 * `null` means "no board to load" — a sheet route opened without its `boardId`
 * param. SWR skips a null key, so nothing is requested for board 0.
 */
export function useBoard(id: number | null) {
  return useSWR<BoardData>(id == null ? null : boardKey(id), () =>
    adminBoardApi.getBoard(id as number),
  );
}
