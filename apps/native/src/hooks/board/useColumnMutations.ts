import { useSWRConfig } from "swr";
import { adminBoardApi } from "@/lib/api";
import { haptics } from "@/lib/haptics";
import { useToast } from "@/hooks/useToast";
import { i18n } from "@/lib/i18n";
import { withErrorToast } from "@/lib/board/with-error-toast";
import type {
  ColumnCreateBody,
  ColumnUpdateBody,
} from "@dragons/api-client";
import type { BoardColumnData } from "@dragons/shared";
import { boardKey } from "./useBoard";

export function useColumnMutations(boardId: number) {
  const { mutate } = useSWRConfig();
  const toast = useToast();

  async function add(body: ColumnCreateBody): Promise<BoardColumnData> {
    return withErrorToast(async () => {
      const created = await adminBoardApi.addColumn(boardId, body);
      await mutate(boardKey(boardId));
      haptics.success();
      toast.show({ title: i18n.t("toast.columnAdded"), variant: "success" });
      return created;
    }, "toast.createFailed", toast);
  }

  async function update(colId: number, body: ColumnUpdateBody): Promise<BoardColumnData> {
    return withErrorToast(async () => {
      const next = await adminBoardApi.updateColumn(boardId, colId, body);
      await mutate(boardKey(boardId));
      return next;
    }, "toast.saveFailed", toast);
  }

  async function remove(colId: number): Promise<void> {
    return withErrorToast(async () => {
      await adminBoardApi.deleteColumn(boardId, colId);
      await mutate(boardKey(boardId));
      haptics.success();
      toast.show({ title: i18n.t("toast.columnDeleted"), variant: "success" });
    }, "toast.deleteFailed", toast);
  }

  async function reorder(order: { id: number; position: number }[]): Promise<void> {
    return withErrorToast(async () => {
      await adminBoardApi.reorderColumns(boardId, order);
      await mutate(boardKey(boardId));
    }, "toast.saveFailed", toast);
  }

  return { add, update, remove, reorder };
}
