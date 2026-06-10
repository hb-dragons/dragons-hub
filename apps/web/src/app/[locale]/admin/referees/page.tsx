import { notFound } from "next/navigation";
import { SWRConfig } from "swr";
import { can } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { getServerApi } from "@/lib/api.server";
import { SWR_KEYS } from "@/lib/swr-keys";
import { todayInBerlin, plusDaysInBerlin } from "@/lib/tz";
import { RefereeHubPage } from "@/components/admin/referee-hub/referee-hub";

export default async function RefereesPage() {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "referee", "view")) notFound();

  const fallback: Record<string, unknown> = {};

  const refereesKey = SWR_KEYS.refereesPaginated({ scope: "own", limit: 50 });

  const today = todayInBerlin();
  const to = plusDaysInBerlin(14);

  const gamesKey = SWR_KEYS.refereeGamesFiltered({
    status: "active",
    dateFrom: today,
    dateTo: to,
    gameType: "both",
    limit: 200,
  });

  const serverApi = await getServerApi();

  try {
    fallback[refereesKey] = await serverApi.refereeAdmin.listReferees({
      scope: "own",
      limit: 50,
    });
  } catch {}

  try {
    fallback[gamesKey] = await serverApi.referees.getGames({
      status: "active",
      dateFrom: today,
      dateTo: to,
      gameType: "both",
      limit: 200,
    });
  } catch {}

  return (
    <SWRConfig value={{ fallback }}>
      <RefereeHubPage />
    </SWRConfig>
  );
}
