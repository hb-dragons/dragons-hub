import useSWR from "swr";
import { queries } from "@/lib/swr-queries";
import type { BoardFilters } from "./use-board-filters";

export function useBoards() {
  const boardsQ = queries.boards();
  return useSWR(boardsQ.key, boardsQ.fetcher);
}

export function useBoard(boardId: number | null) {
  const boardDetailQ = queries.boardDetail(boardId ?? 0);
  return useSWR(boardId ? boardDetailQ.key : null, boardDetailQ.fetcher);
}

export function useBoardTasks(
  boardId: number | null,
  filters?: BoardFilters,
) {
  const serverFilter =
    filters && filters.assigneeIds.length === 1
      ? { assigneeId: filters.assigneeIds[0] }
      : undefined;
  const priorityFilter = filters?.priority
    ? { priority: filters.priority }
    : undefined;
  const boardTasksQ = queries.boardTasks(boardId ?? 0, { ...serverFilter, ...priorityFilter });
  return useSWR(
    boardId ? boardTasksQ.key : null,
    boardTasksQ.fetcher,
  );
}

export function useTaskDetail(taskId: number | null) {
  const taskDetailQ = queries.taskDetail(taskId ?? 0);
  return useSWR(taskId ? taskDetailQ.key : null, taskDetailQ.fetcher);
}
