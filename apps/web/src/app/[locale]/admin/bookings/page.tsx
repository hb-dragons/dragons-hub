import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { getServerApi } from "@/lib/api.server";
import { SWRConfig } from "swr";
import { makeQueries } from "@/lib/swr-queries";
import { HallOccupancyTable } from "@/components/admin/hall-occupancy/hall-occupancy-table";
import type { HallOccupancyDay } from "@dragons/shared";
import { PageError } from "@/components/admin/shared/page-error";

export default async function HallOccupancyPage() {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "booking", "view")) notFound();

  const t = await getTranslations();
  let data: HallOccupancyDay[] | null = null;
  let error: string | null = null;

  const sApi = await getServerApi();
  const sq = makeQueries(sApi);
  const occupancyQ = sq.hallOccupancy();

  try {
    data = await occupancyQ.fetcher();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to API";
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("hallOccupancy.title")} subtitle={t("hallOccupancy.description")} />

      {error ? (
        <PageError message={error} />
      ) : (
        <SWRConfig value={{ fallback: { [occupancyQ.key]: data } }}>
          <HallOccupancyTable />
        </SWRConfig>
      )}
    </div>
  );
}
