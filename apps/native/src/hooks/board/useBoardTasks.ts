import useSWR from "swr";
import { adminBoardApi } from "@/lib/api";
import type { TaskCardData } from "@dragons/shared";
import type { TaskListQuery } from "@dragons/api-client";

const tasksKey = (boardId: number, filters?: TaskListQuery) =>
  [`admin/boards/${boardId}/tasks`, filters ?? null] as const;

/** `null` skips the request — see the note on `useBoard`. */
export function useBoardTasks(boardId: number | null, filters?: TaskListQuery) {
  return useSWR<TaskCardData[]>(
    boardId == null ? null : tasksKey(boardId, filters),
    boardId == null ? null : () => adminBoardApi.listTasks(boardId, filters),
  );
}
