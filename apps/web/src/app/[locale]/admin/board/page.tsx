import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { fetchAPIServer } from "@/lib/api.server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { SWRConfig } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { KanbanBoard } from "@/components/admin/board/kanban-board";
import { CreateBoardButton } from "@/components/admin/board/create-board-button";
import type { BoardData, TaskCardData } from "@/components/admin/board/types";

export default async function BoardPage() {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "settings", "view")) notFound();

  const t = await getTranslations();
  let boards: BoardData[] | null = null;
  let board: BoardData | null = null;
  let tasks: TaskCardData[] | null = null;
  let error: string | null = null;

  try {
    boards = await fetchAPIServer<BoardData[]>("/admin/boards");
    if (boards && boards.length > 0) {
      const firstBoard = boards[0]!;
      [board, tasks] = await Promise.all([
        fetchAPIServer<BoardData>(`/admin/boards/${firstBoard.id}`),
        fetchAPIServer<TaskCardData[]>(`/admin/boards/${firstBoard.id}/tasks`),
      ]);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to API";
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("board.title")} />

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : !board ? (
        <div className="flex flex-col items-center justify-center py-12">
          <p className="mb-4 text-muted-foreground">{t("board.emptyBoard")}</p>
          <CreateBoardButton />
        </div>
      ) : (
        <SWRConfig
          value={{
            fallback: {
              [SWR_KEYS.boardDetail(board.id)]: board,
              [SWR_KEYS.boardTasks(board.id)]: tasks,
            },
          }}
        >
          <KanbanBoard boardId={board.id} />
        </SWRConfig>
      )}
    </div>
  );
}
