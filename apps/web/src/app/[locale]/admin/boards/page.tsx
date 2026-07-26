import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@dragons/shared";
import type { BoardSummary } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { getServerApi } from "@/lib/api.server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { CreateBoardDialog } from "@/components/admin/board/create-board-dialog";
import { PageError } from "@/components/admin/shared/page-error";

export default async function BoardsPage() {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "board", "view")) notFound();

  const t = await getTranslations();
  let boards: BoardSummary[] = [];
  let error: string | null = null;

  try {
    const sApi = await getServerApi();
    boards = await sApi.boards.listBoards();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load boards";
  }

  if (boards.length === 1) {
    redirect(`/admin/boards/${boards[0]!.id}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("board.title")} />

      {error ? (
        <PageError message={error} />
      ) : boards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <p className="mb-4 text-muted-foreground">{t("board.emptyBoard")}</p>
          <CreateBoardDialog />
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((b) => (
            <li key={b.id}>
              <a
                href={`/admin/boards/${b.id}`}
                className="bg-card hover:bg-surface-high block rounded-md p-4 transition-colors"
              >
                <h3 className="font-semibold">{b.name}</h3>
                {b.description && (
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                    {b.description}
                  </p>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
