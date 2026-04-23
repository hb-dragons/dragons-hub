import useSWR from "swr";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import type {
  BoardData,
  BoardSummary,
  TaskCardData,
  TaskDetail,
} from "@dragons/shared";
import type { BoardFilters } from "./use-board-filters";

export function useBoards() {
  return useSWR<BoardSummary[]>(SWR_KEYS.boards, apiFetcher);
}

export function useBoard(boardId: number | null) {
  return useSWR<BoardData>(
    boardId ? SWR_KEYS.boardDetail(boardId) : null,
    apiFetcher,
  );
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
  return useSWR<TaskCardData[]>(
    boardId
      ? SWR_KEYS.boardTasks(boardId, { ...serverFilter, ...priorityFilter })
      : null,
    apiFetcher,
  );
}

export function useTaskDetail(taskId: number | null) {
  return useSWR<TaskDetail>(
    taskId ? SWR_KEYS.taskDetail(taskId) : null,
    apiFetcher,
  );
}
