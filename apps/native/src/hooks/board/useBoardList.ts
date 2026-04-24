import useSWR from "swr";
import { adminBoardApi } from "@/lib/api";
import type { BoardSummary } from "@dragons/shared";

export const BOARD_LIST_KEY = "admin/boards";

export function useBoardList() {
  return useSWR<BoardSummary[]>(BOARD_LIST_KEY, () => adminBoardApi.listBoards());
}
