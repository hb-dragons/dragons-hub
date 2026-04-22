import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SWRConfig } from "swr";
import { can } from "@dragons/shared";
import type {
  HistoryGameItem,
  HistorySummaryResponse,
} from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { fetchAPIServer } from "@/lib/api.server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { HistoryPage } from "@/components/referee/history/history-page";
import {
  gamesKey,
  parseHistoryFilterState,
  summaryKey,
} from "@/components/referee/history/filter-state";

const DEFAULT_LIMIT = 50;

interface HistoryGamesResponse {
  items: HistoryGameItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

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
  const filterState = parseHistoryFilterState(rawParams);

  const sKey = summaryKey(filterState);
  const gKey = gamesKey(filterState, DEFAULT_LIMIT, 0);

  const [summary, games] = await Promise.all([
    fetchAPIServer<HistorySummaryResponse>(sKey).catch(() => null),
    fetchAPIServer<HistoryGamesResponse>(gKey).catch(() => null),
  ]);

  const fallback: Record<string, unknown> = {};
  if (summary) fallback[sKey] = summary;
  if (games) fallback[gKey] = games;

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} />
      <SWRConfig value={{ fallback }}>
        <HistoryPage />
      </SWRConfig>
    </div>
  );
}
