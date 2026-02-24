import { getTranslations } from "next-intl/server";
import { fetchAPIServer } from "@/lib/api.server"
import { MatchListTable } from "@/components/admin/matches/match-list-table"
import type { MatchListResponse } from "@/components/admin/matches/types"
import { getOwnTeamLabel } from "@/components/admin/matches/utils"

export default async function MatchesPage() {
  const t = await getTranslations();
  let data: MatchListResponse | null = null
  let error: string | null = null

  try {
    data = await fetchAPIServer<MatchListResponse>("/admin/matches")
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to API"
  }

  const allItems = data?.items ?? []
  const teamOptions = [
    ...new Set(allItems.map((m) => getOwnTeamLabel(m))),
  ].sort()

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">{t("matches.title")}</h1>

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <MatchListTable
          data={allItems}
          teamOptions={teamOptions}
        />
      )}
    </div>
  )
}
