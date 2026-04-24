import useSWR from "swr";
import { adminBoardApi } from "@/lib/api";
import type { BoardData } from "@dragons/shared";

export const boardKey = (id: number) => `admin/boards/${id}`;

export function useBoard(id: number) {
  return useSWR<BoardData>(boardKey(id), () => adminBoardApi.getBoard(id));
}
