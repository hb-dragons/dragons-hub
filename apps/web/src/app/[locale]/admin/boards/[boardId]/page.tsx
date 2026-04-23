import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SWRConfig } from "swr";
import { can } from "@dragons/shared";
import type { BoardData, TaskCardData } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { fetchAPIServer } from "@/lib/api.server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { BoardView } from "@/components/admin/board/board-view";
import { SWR_KEYS } from "@/lib/swr-keys";

export default async function BoardDetailPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "board", "view")) notFound();

  const { boardId: boardIdParam } = await params;
  const boardId = Number(boardIdParam);
  if (!Number.isInteger(boardId) || boardId <= 0) notFound();

  const t = await getTranslations();
  let board: BoardData | null = null;
  let tasks: TaskCardData[] = [];
  let error: string | null = null;

  try {
    [board, tasks] = await Promise.all([
      fetchAPIServer<BoardData>(`/admin/boards/${boardId}`),
      fetchAPIServer<TaskCardData[]>(`/admin/boards/${boardId}/tasks`),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load board";
  }

  if (!board) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("board.title")} />
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error ?? "Board not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title={board.name} />
      <SWRConfig
        value={{
          fallback: {
            [SWR_KEYS.boardDetail(boardId)]: board,
            [SWR_KEYS.boardTasks(boardId)]: tasks,
          },
        }}
      >
        <BoardView boardId={boardId} />
      </SWRConfig>
    </div>
  );
}
