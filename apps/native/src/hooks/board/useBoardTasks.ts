import useSWR from "swr";
import { adminBoardApi } from "@/lib/api";
import type { TaskCardData } from "@dragons/shared";
import type { TaskListFilters } from "@dragons/api-client";

export const tasksKey = (boardId: number, filters?: TaskListFilters) =>
  [`admin/boards/${boardId}/tasks`, filters ?? null] as const;

export function useBoardTasks(boardId: number, filters?: TaskListFilters) {
  return useSWR<TaskCardData[]>(tasksKey(boardId, filters), () =>
    adminBoardApi.listTasks(boardId, filters),
  );
}
