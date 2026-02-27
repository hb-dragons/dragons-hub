import { getTranslations } from "next-intl/server";
import { fetchAPIServer } from "@/lib/api.server"
import { SWRConfig } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { MatchListTable } from "@/components/admin/matches/match-list-table"
import type { PaginatedResponse, MatchListItem } from "@/components/admin/matches/types"

export default async function MatchesPage() {
  const t = await getTranslations();
  let data: PaginatedResponse<MatchListItem> | null = null
  let error: string | null = null

  try {
    data = await fetchAPIServer<PaginatedResponse<MatchListItem>>("/admin/matches")
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to API"
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">{t("matches.title")}</h1>

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <SWRConfig value={{ fallback: { [SWR_KEYS.matches]: data } }}>
          <MatchListTable />
        </SWRConfig>
      )}
    </div>
  )
}
