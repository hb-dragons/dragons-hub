import { notFound } from "next/navigation";
import { SWRConfig } from "swr";
import { can } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { getServerApi } from "@/lib/api.server";
import { SWR_KEYS } from "@/lib/swr-keys";
import { makeQueries } from "@/lib/swr-queries";
import { todayInBerlin, plusDaysInBerlin } from "@/lib/tz";
import { RefereeHubPage } from "@/components/admin/referee-hub/referee-hub";

export default async function RefereesPage() {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "referee", "view")) notFound();

  const fallback: Record<string, unknown> = {};

  const serverApi = await getServerApi();

  const refereesKey = SWR_KEYS.refereesPaginated({ scope: "own", limit: 50 });

  const today = todayInBerlin();
  const to = plusDaysInBerlin(14);

  const gamesQ = makeQueries(serverApi).refereeGamesFiltered({
    status: "active",
    dateFrom: today,
    dateTo: to,
    gameType: "both",
    limit: 200,
  });

  try {
    fallback[refereesKey] = await serverApi.refereeAdmin.listReferees({
      scope: "own",
      limit: 50,
    });
  } catch {}

  try {
    fallback[gamesQ.key] = await gamesQ.fetcher();
  } catch {}

  return (
    <SWRConfig value={{ fallback }}>
      <RefereeHubPage />
    </SWRConfig>
  );
}
