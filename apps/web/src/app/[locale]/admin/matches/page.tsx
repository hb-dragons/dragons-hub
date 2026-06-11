import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { getServerApi } from "@/lib/api.server"
import { SWRConfig } from "swr";
import { makeQueries } from "@/lib/swr-queries";
import { MatchListTable } from "@/components/admin/matches/match-list-table"
import type { PaginatedResponse, MatchListItem } from "@/components/admin/matches/types"

export default async function MatchesPage() {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "match", "view")) notFound();

  const t = await getTranslations();
  let data: PaginatedResponse<MatchListItem> | null = null
  let error: string | null = null

  const sApi = await getServerApi()
  const sq = makeQueries(sApi);
  const matchesQ = sq.matches();

  try {
    data = await matchesQ.fetcher()
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to API"
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("matches.title")} />

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <SWRConfig value={{ fallback: { [matchesQ.key]: data } }}>
          <MatchListTable />
        </SWRConfig>
      )}
    </div>
  )
}
