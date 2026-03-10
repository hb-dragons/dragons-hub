import { fetchAPI } from "@/lib/api";
import { getTranslations } from "next-intl/server";
import type { MatchListItem } from "@dragons/shared";
import type { PublicTeamWithClubFlag } from "@/components/public/schedule/types";
import {
  getSaturday,
  getSunday,
  getMonthStart,
  getMonthEnd,
  toDateString,
} from "@/lib/weekend-utils";
import { SchedulePageClient } from "@/components/public/schedule/schedule-page-client";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const t = await getTranslations("public");

  const teamParam = typeof params.team === "string" ? params.team : undefined;
  const view = params.view === "calendar" ? "calendar" : "weekend";

  const allTeams = await fetchAPI<PublicTeamWithClubFlag[]>(
    "/public/teams",
  ).catch(() => []);
  const ownClubTeams = allTeams.filter((team) => team.isOwnClub);

  const queryParams = new URLSearchParams();
  if (teamParam) {
    queryParams.set("teamApiId", teamParam);
  }

  const saturday = getSaturday(new Date());
  const monthStart = getMonthStart(new Date());

  if (view === "calendar") {
    queryParams.set("dateFrom", toDateString(monthStart));
    queryParams.set("dateTo", toDateString(getMonthEnd(new Date())));
  } else {
    queryParams.set("dateFrom", toDateString(saturday));
    queryParams.set("dateTo", toDateString(getSunday(saturday)));
  }

  const matchData = await fetchAPI<{ items: MatchListItem[] }>(
    `/public/matches?${queryParams}`,
  ).catch(() => ({ items: [] }));

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("schedule")}</h1>
      <SchedulePageClient
        view={view}
        teams={ownClubTeams}
        initialMatches={matchData.items}
        initialSaturday={toDateString(saturday)}
        initialMonth={toDateString(monthStart)}
        translations={{
          allTeams: t("allTeams"),
          vs: t("vs"),
          matchCancelled: t("matchCancelled"),
          matchForfeited: t("matchForfeited"),
          noMatchesThisWeekend: t("noMatchesThisWeekend"),
          noMatchesOnDay: t("noMatchesOnDay"),
          weekendView: t("weekendView"),
          calendarView: t("calendarView"),
        }}
        apiBaseUrl={apiBaseUrl}
      />
    </div>
  );
}
