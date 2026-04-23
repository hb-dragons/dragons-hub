import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@dragons/shared";
import type { BoardSummary } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { fetchAPIServer } from "@/lib/api.server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { CreateBoardDialog } from "@/components/admin/board/create-board-dialog";

export default async function BoardsPage() {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "board", "view")) notFound();

  const t = await getTranslations();
  let boards: BoardSummary[] = [];
  let error: string | null = null;

  try {
    boards = await fetchAPIServer<BoardSummary[]>("/admin/boards");
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
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
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
                className="block rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
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
