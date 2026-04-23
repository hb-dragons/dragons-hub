import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { fetchAPI } from "@/lib/api";
import { SWR_KEYS } from "@/lib/swr-keys";
import type { BoardColumnData } from "@dragons/shared";

export interface ColumnCreateInput {
  name: string;
  color?: string | null;
  isDoneColumn?: boolean;
}

export interface ColumnUpdateInput {
  name?: string;
  color?: string | null;
  isDoneColumn?: boolean;
  position?: number;
}

export function useColumnMutations(boardId: number) {
  const { mutate } = useSWRConfig();

  async function addColumn(input: ColumnCreateInput): Promise<BoardColumnData> {
    try {
      const col = await fetchAPI<BoardColumnData>(
        `/admin/boards/${boardId}/columns`,
        { method: "POST", body: JSON.stringify(input) },
      );
      await mutate(SWR_KEYS.boardDetail(boardId));
      return col;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add column");
      throw err;
    }
  }

  async function updateColumn(
    colId: number,
    input: ColumnUpdateInput,
  ): Promise<void> {
    try {
      await fetchAPI(`/admin/boards/${boardId}/columns/${colId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      await mutate(SWR_KEYS.boardDetail(boardId));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update column",
      );
      throw err;
    }
  }

  async function deleteColumn(colId: number): Promise<void> {
    try {
      await fetchAPI(`/admin/boards/${boardId}/columns/${colId}`, {
        method: "DELETE",
      });
      await mutate(SWR_KEYS.boardDetail(boardId));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete column",
      );
      throw err;
    }
  }

  async function reorderColumns(
    columns: { id: number; position: number }[],
  ): Promise<void> {
    try {
      await fetchAPI(`/admin/boards/${boardId}/columns/reorder`, {
        method: "PATCH",
        body: JSON.stringify({ columns }),
      });
      await mutate(SWR_KEYS.boardDetail(boardId));
    } catch (err) {
      await mutate(SWR_KEYS.boardDetail(boardId));
      toast.error(
        err instanceof Error ? err.message : "Failed to reorder columns",
      );
      throw err;
    }
  }

  return { addColumn, updateColumn, deleteColumn, reorderColumns };
}
