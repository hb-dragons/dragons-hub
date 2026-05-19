import { notFound } from "next/navigation";
import { SWRConfig } from "swr";
import { can } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { fetchAPIServer } from "@/lib/api.server";
import { SWR_KEYS } from "@/lib/swr-keys";
import { RefereeHubPage } from "@/components/admin/referee-hub/referee-hub";

export default async function RefereesPage() {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "referee", "view")) notFound();

  const fallback: Record<string, unknown> = {};

  const refereesKey = SWR_KEYS.refereesPaginated({ scope: "own", limit: 50 });

  // Europe/Berlin is the canonical timezone for this German basketball admin tool.
  function todayInTz(tz: string): string {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(new Date()); // "YYYY-MM-DD"
  }

  function plusDaysInTz(tz: string, days: number): string {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const d = new Date();
    d.setDate(d.getDate() + days);
    return fmt.format(d);
  }

  const TZ = "Europe/Berlin";
  const today = todayInTz(TZ);
  const to = plusDaysInTz(TZ, 14);

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
