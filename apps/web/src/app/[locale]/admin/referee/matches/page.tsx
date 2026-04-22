import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can, isReferee } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { fetchAPIServer } from "@/lib/api.server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { SWRConfig } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { RefereeGamesList } from "@/components/referee/referee-games-list";
import type { RefereeGameListItem, PaginatedResponse } from "@dragons/shared";

export default async function RefereeMatchesPage() {
  const session = await getServerSession();
  const user = session?.user ?? null;
  if (!isReferee(user) && !can(user, "assignment", "view")) notFound();

  const t = await getTranslations("refereeGames");
  let data: PaginatedResponse<RefereeGameListItem> | null = null;
  let error: string | null = null;

  try {
    data = await fetchAPIServer<PaginatedResponse<RefereeGameListItem>>(
      SWR_KEYS.refereeGames,
    );
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to API";
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} />
      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <SWRConfig value={{ fallback: { [SWR_KEYS.refereeGames]: data } }}>
          <RefereeGamesList isAdmin />
        </SWRConfig>
      )}
    </div>
  );
}
