import { getServerApi } from "@/lib/api.server";
import { SWRConfig } from "swr";
import { makeQueries } from "@/lib/swr-queries";
import { todayInClubZone } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { DashboardView } from "@/components/admin/dashboard/dashboard-view";

export default async function AdminDashboardPage() {
  // Club operates in Europe/Berlin; UTC date would show the wrong day's
  // fixtures between Berlin midnight and 01:00/02:00. Must match the client's
  // todayInClubZone() so the SWR fallback key lines up.
  const today = todayInClubZone();

  // `getServerSession` is React-cached, so this shares the layout's round trip
  // rather than adding one. Handing the user to the client view keeps every
  // permission check true on first paint.
  const [session, sApi] = await Promise.all([getServerSession(), getServerApi()]);
  const sq = makeQueries(sApi);

  // All six dashboard queries are prefetched, not three: an unprefetched query
  // hydrates as `undefined`, which the view has to render as "unknown".
  const prefetches = [
    sq.refereesPaginated({ scope: "own", limit: 50 }),
    sq.standings(),
    sq.dashboardTodayMatches(today),
    sq.dashboardUpcomingMatches(),
    sq.teams(),
    sq.syncStatus(),
  ];

  const results = await Promise.allSettled(prefetches.map((q) => q.fetcher()));

  const fallback: Record<string, unknown> = {};
  results.forEach((result, i) => {
    // A rejected prefetch is deliberately left out of the fallback so the
    // client refetches and can surface its own error state, rather than
    // hydrating `undefined` as if it were real data.
    if (result.status === "fulfilled") {
      fallback[prefetches[i]!.key] = result.value;
    }
  });

  return (
    <SWRConfig value={{ fallback }}>
      <DashboardView user={session?.user ?? null} />
    </SWRConfig>
  );
}
