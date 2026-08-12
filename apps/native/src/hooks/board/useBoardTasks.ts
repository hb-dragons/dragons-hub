import useSWR from "swr";
import { adminBoardApi } from "@/lib/api";
import type { TaskCardData } from "@dragons/shared";
import type { TaskListQuery } from "@dragons/api-client";
import { boardTasksKeyPrefix } from "@/lib/board/task-keys";

const tasksKey = (boardId: number, filters?: TaskListQuery) =>
  [boardTasksKeyPrefix(boardId), filters ?? null] as const;

/** `null` skips the request — see the note on `useBoard`. */
export function useBoardTasks(boardId: number | null, filters?: TaskListQuery) {
  return useSWR<TaskCardData[]>(
    boardId == null ? null : tasksKey(boardId, filters),
    boardId == null ? null : () => adminBoardApi.listTasks(boardId, filters),
  );
}
