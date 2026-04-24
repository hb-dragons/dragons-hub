import useSWR from "swr";
import { adminBoardApi } from "@/lib/api";
import type { TaskDetail } from "@dragons/shared";

export const taskKey = (id: number) => `admin/tasks/${id}`;

export function useTaskDetail(id: number | null) {
  return useSWR<TaskDetail | null>(
    id == null ? null : taskKey(id),
    async () => (id == null ? null : adminBoardApi.getTask(id)),
  );
}
