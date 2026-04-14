import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { fetchAPIServer } from "@/lib/api.server"
import { SWRConfig } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { StandingsView } from "@/components/admin/standings/standings-view"
import type { LeagueStandings } from "@/components/admin/standings/types"

export default async function StandingsPage() {
  const t = await getTranslations();
  let data: LeagueStandings[] | null = null
  let error: string | null = null

  try {
    data = await fetchAPIServer<LeagueStandings[]>("/admin/standings")
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
        <SWRConfig value={{ fallback: { [SWR_KEYS.standings]: data } }}>
          <StandingsView />
        </SWRConfig>
      )}
    </div>
  )
}
