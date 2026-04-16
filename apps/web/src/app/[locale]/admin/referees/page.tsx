import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { fetchAPIServer } from "@/lib/api.server"
import { SWRConfig } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { RefereeListTable } from "@/components/admin/referees/referee-list-table"
import type { PaginatedResponse, RefereeListItem } from "@/components/admin/referees/types"

export default async function RefereesPage() {
  const t = await getTranslations();
  let data: PaginatedResponse<RefereeListItem> | null = null
  let error: string | null = null

  try {
    data = await fetchAPIServer<PaginatedResponse<RefereeListItem>>("/admin/referees")
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to API"
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("referees.title")} />

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <SWRConfig value={{ fallback: { [SWR_KEYS.referees()]: data } }}>
          <RefereeListTable />
        </SWRConfig>
      )}
    </div>
  )
}
