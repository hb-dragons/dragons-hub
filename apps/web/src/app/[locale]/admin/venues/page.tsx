import { getTranslations } from "next-intl/server";
import { fetchAPIServer } from "@/lib/api.server"
import { PageHeader } from "@/components/admin/shared/page-header";
import { SWRConfig } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { VenueListTable } from "@/components/admin/venues/venue-list-table"
import type { VenueListItem } from "@/components/admin/venues/types"

export default async function VenuesPage() {
  const t = await getTranslations();
  let data: VenueListItem[] | null = null;
  let error: string | null = null;

  try {
    data = await fetchAPIServer<VenueListItem[]>("/admin/venues");
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to API";
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("venues.title")} />

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <SWRConfig value={{ fallback: { [SWR_KEYS.venues]: data } }}>
          <VenueListTable />
        </SWRConfig>
      )}
    </div>
  );
}
