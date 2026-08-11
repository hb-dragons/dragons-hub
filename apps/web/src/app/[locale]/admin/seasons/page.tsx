import { getTranslations } from "next-intl/server";
import { getServerSession } from "@/lib/auth-server";
import { can } from "@dragons/shared";
import { notFound } from "next/navigation";
import { getServerApi } from "@/lib/api.server";
import { makeQueries } from "@/lib/swr-queries";
import { SWRConfig } from "swr";
import { SeasonsList } from "@/components/admin/seasons/seasons-list";
import { PageHeader } from "@/components/admin/shared/page-header";
import type { SeasonWithCounts } from "@dragons/shared";

export default async function SeasonsPage() {
  const session = await getServerSession();
  // Every action on this page (create, activate, manage leagues) is behind
  // settings:update, so viewing it read-only would be a page of dead buttons.
  if (!can(session?.user ?? null, "settings", "update")) notFound();

  const t = await getTranslations();
  const serverApi = await getServerApi();
  const q = makeQueries(serverApi).seasons();
  let seasons: SeasonWithCounts[] = [];
  try {
    seasons = await q.fetcher();
  } catch {
    // empty state
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("settings.seasons.title")}
        subtitle={t("settings.seasons.subtitle")}
      />
      <SWRConfig value={{ fallback: { [q.key]: seasons } }}>
        <SeasonsList />
      </SWRConfig>
    </div>
  );
}
