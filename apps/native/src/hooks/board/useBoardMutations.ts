import { useSWRConfig } from "swr";
import { adminBoardApi } from "@/lib/api";
import { haptics } from "@/lib/haptics";
import { useToast } from "@/hooks/useToast";
import { i18n } from "@/lib/i18n";
import type {
  CreateBoardBody,
  UpdateBoardBody,
} from "@dragons/api-client";
import type { BoardData } from "@dragons/shared";
import { BOARD_LIST_KEY } from "./useBoardList";
import { boardKey } from "./useBoard";

export function useBoardMutations() {
  const { mutate } = useSWRConfig();
  const toast = useToast();

  async function create(body: CreateBoardBody): Promise<BoardData> {
    try {
      const created = await adminBoardApi.createBoard(body);
      await Promise.all([
        mutate(BOARD_LIST_KEY),
        mutate(boardKey(created.id), created, { revalidate: false }),
      ]);
      haptics.success();
      toast.show({ title: i18n.t("toast.boardCreated"), variant: "success" });
      return created;
    } catch (error) {
      haptics.warning();
      toast.show({ title: i18n.t("toast.createFailed"), variant: "error" });
      throw error;
    }
  }

  async function update(id: number, body: UpdateBoardBody): Promise<BoardData> {
    try {
      const next = await adminBoardApi.updateBoard(id, body);
      await Promise.all([
        mutate(boardKey(id), next, { revalidate: false }),
        mutate(BOARD_LIST_KEY),
      ]);
      return next;
    } catch (error) {
      haptics.warning();
      toast.show({ title: i18n.t("toast.saveFailed"), variant: "error" });
      throw error;
    }
  }

  async function remove(id: number): Promise<void> {
    try {
      await adminBoardApi.deleteBoard(id);
      await Promise.all([
        mutate(boardKey(id), undefined, { revalidate: false }),
        mutate(BOARD_LIST_KEY),
      ]);
      haptics.success();
      toast.show({ title: i18n.t("toast.boardDeleted"), variant: "success" });
    } catch (error) {
      haptics.warning();
      toast.show({ title: i18n.t("toast.deleteFailed"), variant: "error" });
      throw error;
    }
  }

  return { create, update, remove };
}
