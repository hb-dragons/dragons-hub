import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { fetchAPI } from "@/lib/api";
import { SWR_KEYS } from "@/lib/swr-keys";
import type { BoardData } from "@dragons/shared";

export interface BoardCreateInput {
  name: string;
  description?: string | null;
}

export interface BoardUpdateInput {
  name?: string;
  description?: string | null;
}

export function useBoardMutations() {
  const { mutate } = useSWRConfig();

  async function createBoard(input: BoardCreateInput): Promise<BoardData> {
    try {
      const board = await fetchAPI<BoardData>("/admin/boards", {
        method: "POST",
        body: JSON.stringify(input),
      });
      await mutate(SWR_KEYS.boards);
      return board;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create board");
      throw err;
    }
  }

  async function updateBoard(
    id: number,
    input: BoardUpdateInput,
  ): Promise<void> {
    try {
      await fetchAPI(`/admin/boards/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      await Promise.all([
        mutate(SWR_KEYS.boardDetail(id)),
        mutate(SWR_KEYS.boards),
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update board");
      throw err;
    }
  }

  async function deleteBoard(id: number): Promise<void> {
    try {
      await fetchAPI(`/admin/boards/${id}`, { method: "DELETE" });
      await mutate(SWR_KEYS.boards);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete board");
      throw err;
    }
  }

  return { createBoard, updateBoard, deleteBoard };
}
