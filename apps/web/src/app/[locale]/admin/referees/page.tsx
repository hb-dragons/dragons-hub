import { notFound } from "next/navigation";
import { SWRConfig } from "swr";
import { can } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { getServerApi } from "@/lib/api.server";
import { makeQueries } from "@/lib/swr-queries";
import { OPEN_GAMES_PREFETCH_OPTS } from "@/components/admin/referee-hub/open-slots/open-games-query";
import { RefereeHubPage } from "@/components/admin/referee-hub/referee-hub";

export default async function RefereesPage() {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "referee", "view")) notFound();

  const serverApi = await getServerApi();
  const sq = makeQueries(serverApi);

  // The games prefetch must use the hub's *default* filters. It previously
  // asked for a 14-day window with no slotStatus, a key the client never
  // requests, so the whole server round trip was discarded.
  const prefetches = [
    sq.refereesPaginated({ scope: "own", limit: 50 }),
    sq.refereeGamesFiltered(OPEN_GAMES_PREFETCH_OPTS),
  ];

  // The two fetches are independent; awaiting them in sequence doubled the
  // time to first paint for no reason.
  const results = await Promise.allSettled(prefetches.map((q) => q.fetcher()));

  const fallback: Record<string, unknown> = {};
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      fallback[prefetches[i]!.key] = result.value;
    }
  });

  return (
    <SWRConfig value={{ fallback }}>
      <RefereeHubPage />
    </SWRConfig>
  );
}
