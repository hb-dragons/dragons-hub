import { notFound } from "next/navigation";
import { SWRConfig } from "swr";
import { can } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { fetchAPIServer } from "@/lib/api.server";
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

  try {
    fallback[refereesKey] = await fetchAPIServer<unknown>(refereesKey);
  } catch {}

  try {
    fallback[gamesKey] = await fetchAPIServer<unknown>(gamesKey);
  } catch {}

  return (
    <SWRConfig value={{ fallback }}>
      <RefereeHubPage />
    </SWRConfig>
  );
}
