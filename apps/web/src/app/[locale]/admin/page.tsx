import { fetchAPIServer, getServerApi } from "@/lib/api.server";
import { SWRConfig } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { todayInBerlin } from "@/lib/tz";
import { DashboardView } from "@/components/admin/dashboard/dashboard-view";
import type {
  PaginatedResponse,
  RefereeListItem,
} from "@dragons/shared";

export default async function AdminDashboardPage() {
  // Club operates in Europe/Berlin; UTC date would show the wrong day's
  // fixtures between Berlin midnight and 01:00/02:00. Must match the client's
  // todayInBerlin() so the SWR fallback key lines up.
  const today = todayInBerlin();

  const sApi = await getServerApi();

  const [referees, standings, todayMatches] = await Promise.allSettled([
    fetchAPIServer<PaginatedResponse<RefereeListItem>>(
      "/admin/referees?scope=own&sort=name&limit=50&offset=0",
    ),
    sApi.standings.list(),
    sApi.matches.list({ dateFrom: today, dateTo: today, limit: 20, offset: 0 }),
  ]);

  const fallback: Record<string, unknown> = {};

  if (referees.status === "fulfilled") {
    fallback[SWR_KEYS.refereesPaginated({ scope: "own", limit: 50 })] = referees.value;
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
