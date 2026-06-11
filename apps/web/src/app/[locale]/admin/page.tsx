import { getServerApi } from "@/lib/api.server";
import { SWRConfig } from "swr";
import { makeQueries } from "@/lib/swr-queries";
import { todayInBerlin } from "@/lib/tz";
import { DashboardView } from "@/components/admin/dashboard/dashboard-view";

export default async function AdminDashboardPage() {
  // Club operates in Europe/Berlin; UTC date would show the wrong day's
  // fixtures between Berlin midnight and 01:00/02:00. Must match the client's
  // todayInBerlin() so the SWR fallback key lines up.
  const today = todayInBerlin();

  const sApi = await getServerApi();
  const sq = makeQueries(sApi);

  const refsQ = sq.refereesPaginated({ scope: "own", limit: 50 });
  const standingsQ = sq.standings();
  const todayQ = sq.dashboardTodayMatches(today);

  const [referees, standings, todayMatches] = await Promise.allSettled([
    refsQ.fetcher(),
    standingsQ.fetcher(),
    todayQ.fetcher(),
  ]);

  const fallback: Record<string, unknown> = {};

  if (referees.status === "fulfilled") {
    fallback[refsQ.key] = referees.value;
  }
  if (standings.status === "fulfilled") {
    fallback[standingsQ.key] = standings.value;
  }
  if (todayMatches.status === "fulfilled") {
    fallback[todayQ.key] = todayMatches.value;
  }

  return (
    <SWRConfig value={{ fallback }}>
      <DashboardView />
    </SWRConfig>
  );
}
