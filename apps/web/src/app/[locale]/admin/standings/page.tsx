import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { getServerApi } from "@/lib/api.server"
import { SWRConfig } from "swr";
import { makeQueries } from "@/lib/swr-queries";
import { StandingsView } from "@/components/admin/standings/standings-view"
import type { LeagueStandings } from "@/components/admin/standings/types"

export default async function StandingsPage() {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "standing", "view")) notFound();

  const t = await getTranslations();
  let data: LeagueStandings[] | null = null
  let error: string | null = null

  const sApi = await getServerApi();
  const sq = makeQueries(sApi);
  const standingsQ = sq.standings();

  try {
    data = await standingsQ.fetcher()
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to API"
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("standings.title")} subtitle={t("standings.description")} />

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <SWRConfig value={{ fallback: { [standingsQ.key]: data } }}>
          <StandingsView />
        </SWRConfig>
      )}
    </div>
  )
}
