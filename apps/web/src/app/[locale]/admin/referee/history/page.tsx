import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SWRConfig } from "swr";
import { can } from "@dragons/shared";
import type { HistorySummaryResponse } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { fetchAPIServer } from "@/lib/api.server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { HistoryPage } from "@/components/referee/history/history-page";
import {
  parseHistoryFilterState,
  summaryKey,
} from "@/components/referee/history/filter-state";

export default async function RefereeHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerSession();
  const user = session?.user ?? null;
  if (!can(user, "assignment", "view")) notFound();

  const t = await getTranslations("refereeHistory");
  const rawParams = await searchParams;
  const state = parseHistoryFilterState(rawParams);
  const sKey = summaryKey(state);
  const summary = await fetchAPIServer<HistorySummaryResponse>(sKey).catch(() => null);

  const fallback: Record<string, unknown> = {};
  if (summary) fallback[sKey] = summary;

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} />
      <SWRConfig value={{ fallback }}>
        <HistoryPage />
      </SWRConfig>
    </div>
  );
}
