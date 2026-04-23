"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dragons/ui/components/dropdown-menu";
import { Button } from "@dragons/ui/components/button";
import { MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { BoardSwitcher } from "./board-switcher";
import { TaskFilters } from "./task-filters";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { useBoardMutations } from "@/hooks/use-board-mutations";

export interface BoardToolbarProps {
  boardId: number;
  onAddColumn: () => void;
}

export function BoardToolbar({ boardId, onAddColumn }: BoardToolbarProps) {
  const t = useTranslations("board");
  const router = useRouter();
  const { deleteBoard } = useBoardMutations();
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function confirmDelete() {
    await deleteBoard(boardId);
    router.push("/admin/boards");
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
        <BoardSwitcher currentBoardId={boardId} />
        <div className="ml-2 h-6 border-l" />
        <TaskFilters />
        <span className="flex-1" />
        <Button variant="outline" size="sm" className="h-8" onClick={onAddColumn}>
          <Plus className="mr-1 h-4 w-4" />
          {t("addColumn")}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              {t("actions.deleteBoard")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("delete.boardTitle")}
        body={t("delete.boardBody")}
        onConfirm={confirmDelete}
      />
    </>
  );
}
