import { useSWRConfig } from "swr";
import { adminBoardApi } from "@/lib/api";
import { haptics } from "@/lib/haptics";
import { useToast } from "@/hooks/useToast";
import { i18n } from "@/lib/i18n";
import type {
  AddColumnBody,
  UpdateColumnBody,
} from "@dragons/api-client";
import type { BoardColumnData } from "@dragons/shared";
import { boardKey } from "./useBoard";

type FailKey =
  | "toast.saveFailed"
  | "toast.deleteFailed"
  | "toast.createFailed";

export function useColumnMutations(boardId: number) {
  const { mutate } = useSWRConfig();
  const toast = useToast();

  async function withErrorToast<T>(fn: () => Promise<T>, failKey: FailKey): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      haptics.warning();
      toast.show({ title: i18n.t(failKey), variant: "error" });
      throw error;
    }
  }

  async function add(body: AddColumnBody): Promise<BoardColumnData> {
    return withErrorToast(async () => {
      const created = await adminBoardApi.addColumn(boardId, body);
      await mutate(boardKey(boardId));
      haptics.success();
      toast.show({ title: i18n.t("toast.columnAdded"), variant: "success" });
      return created;
    }, "toast.createFailed");
  }

  async function update(colId: number, body: UpdateColumnBody): Promise<BoardColumnData> {
    return withErrorToast(async () => {
      const next = await adminBoardApi.updateColumn(boardId, colId, body);
      await mutate(boardKey(boardId));
      return next;
    }, "toast.saveFailed");
  }

  async function remove(colId: number): Promise<void> {
    return withErrorToast(async () => {
      await adminBoardApi.deleteColumn(boardId, colId);
      await mutate(boardKey(boardId));
      haptics.success();
      toast.show({ title: i18n.t("toast.columnDeleted"), variant: "success" });
    }, "toast.deleteFailed");
  }

  async function reorder(order: { id: number; position: number }[]): Promise<void> {
    return withErrorToast(async () => {
      await adminBoardApi.reorderColumns(boardId, order);
      await mutate(boardKey(boardId));
    }, "toast.saveFailed");
  }

  return { add, update, remove, reorder };
}
