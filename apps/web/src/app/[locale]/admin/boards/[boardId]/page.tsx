import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SWRConfig } from "swr";
import { can, TASK_PRIORITIES } from "@dragons/shared";
import type {
  BoardData,
  BoardSummary,
  TaskCardData,
  TaskPriority,
} from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { fetchAPIServer } from "@/lib/api.server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { BoardView } from "@/components/admin/board/board-view";
import { SWR_KEYS } from "@/lib/swr-keys";

export default async function BoardDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ boardId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "board", "view")) notFound();

  const { boardId: boardIdParam } = await params;
  const boardId = Number(boardIdParam);
  if (!Number.isInteger(boardId) || boardId <= 0) notFound();

  const sp = await searchParams;
  const assigneeRaw = sp.assignee;
  const assigneeIds = Array.isArray(assigneeRaw)
    ? assigneeRaw
    : assigneeRaw
      ? [assigneeRaw]
      : [];
  const priorityRaw = typeof sp.priority === "string" ? sp.priority : null;
  const priority: TaskPriority | null =
    priorityRaw && (TASK_PRIORITIES as readonly string[]).includes(priorityRaw)
      ? (priorityRaw as TaskPriority)
      : null;

  // Match the client SWR key: server-side filter only fires for a single assignee
  // (multi-assignee filtering happens client-side in BoardView).
  const tasksKey = SWR_KEYS.boardTasks(boardId, {
    ...(assigneeIds.length === 1 ? { assigneeId: assigneeIds[0] } : {}),
    ...(priority ? { priority } : {}),
  });

  const t = await getTranslations();
  let board: BoardData | null = null;
  let tasks: TaskCardData[] = [];
  let boards: BoardSummary[] = [];
  let error: string | null = null;

  try {
    [board, tasks, boards] = await Promise.all([
      fetchAPIServer<BoardData>(`/admin/boards/${boardId}`),
      fetchAPIServer<TaskCardData[]>(tasksKey),
      fetchAPIServer<BoardSummary[]>(SWR_KEYS.boards),
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
            [tasksKey]: tasks,
            [SWR_KEYS.boards]: boards,
          },
        }}
      >
        <BoardView boardId={boardId} />
      </SWRConfig>
    </div>
  );
}
