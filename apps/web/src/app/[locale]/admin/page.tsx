import { fetchAPIServer } from "@/lib/api.server";
import { SWRConfig } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { DashboardView } from "@/components/admin/dashboard/dashboard-view";
import type {
  PaginatedResponse,
  MatchListItem,
  LeagueStandings,
  RefereeListItem,
} from "@dragons/shared";

export default async function AdminDashboardPage() {
  const today = new Date().toISOString().slice(0, 10);

  const [referees, standings, todayMatches] = await Promise.allSettled([
    fetchAPIServer<PaginatedResponse<RefereeListItem>>(
      "/admin/referees?limit=1&offset=0",
    ),
    fetchAPIServer<LeagueStandings[]>("/admin/standings"),
    fetchAPIServer<PaginatedResponse<MatchListItem>>(
      `/admin/matches?dateFrom=${today}&dateTo=${today}&limit=20&offset=0`,
    ),
  ]);

  const fallback: Record<string, unknown> = {};

  if (referees.status === "fulfilled") {
    fallback[SWR_KEYS.referees] = referees.value;
  }
  if (standings.status === "fulfilled") {
    fallback[SWR_KEYS.standings] = standings.value;
  }
  if (todayMatches.status === "fulfilled") {
    fallback[SWR_KEYS.dashboardTodayMatches(today)] = todayMatches.value;
  }

  return (
    <SWRConfig value={{ fallback }}>
      <DashboardView />
    </SWRConfig>
  );
}
