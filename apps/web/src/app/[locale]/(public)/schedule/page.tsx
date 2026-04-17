import { getPublicApi } from "@/lib/api-client.server";
import { getTranslations } from "next-intl/server";
import type { MatchQueryParams } from "@dragons/api-client";
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

  const allTeams = await getPublicApi().getTeams().catch(() => []);
  const ownClubTeams = allTeams.filter((team) => team.isOwnClub);

  const saturday = getSaturday(new Date());
  const monthStart = getMonthStart(new Date());

  const matchParams: MatchQueryParams = {};
  if (teamParam) matchParams.teamApiId = Number(teamParam);
  if (view === "calendar") {
    matchParams.dateFrom = toDateString(monthStart);
    matchParams.dateTo = toDateString(getMonthEnd(new Date()));
  } else {
    matchParams.dateFrom = toDateString(saturday);
    matchParams.dateTo = toDateString(getSunday(saturday));
  }

  const matchData = await getPublicApi().getMatches(matchParams).catch(() => ({ items: [] }));

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
          subscribe: t("subscribe"),
          subscribeTitle: t("subscribeTitle"),
          copy: t("copy"),
          copied: t("copied"),
          instructionApple: t("instructionApple"),
          instructionGoogle: t("instructionGoogle"),
          instructionOutlook: t("instructionOutlook"),
        }}
      />
    </div>
  );
}
