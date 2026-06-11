import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { getServerApi } from "@/lib/api.server"
import { PageHeader } from "@/components/admin/shared/page-header";
import { SWRConfig } from "swr";
import { makeQueries } from "@/lib/swr-queries";
import { VenueListTable } from "@/components/admin/venues/venue-list-table"
import type { VenueListItem } from "@/components/admin/venues/types"

export default async function VenuesPage() {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "venue", "view")) notFound();

  const t = await getTranslations();
  let data: VenueListItem[] | null = null;
  let error: string | null = null;

  const sApi = await getServerApi();
  const sq = makeQueries(sApi);
  const venuesQ = sq.venues();

  try {
    data = await venuesQ.fetcher();
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
        <SWRConfig value={{ fallback: { [venuesQ.key]: data } }}>
          <VenueListTable />
        </SWRConfig>
      )}
    </div>
  );
}
