import useSWR from "swr";
import { adminBoardApi } from "@/lib/api";
import type { TaskCardData } from "@dragons/shared";
import type { TaskListQuery } from "@dragons/api-client";

export const tasksKey = (boardId: number, filters?: TaskListQuery) =>
  [`admin/boards/${boardId}/tasks`, filters ?? null] as const;

export function useBoardTasks(boardId: number, filters?: TaskListQuery) {
  return useSWR<TaskCardData[]>(tasksKey(boardId, filters), () =>
    adminBoardApi.listTasks(boardId, filters),
  );
}
