import { fetchAPI } from "@/lib/api";
import { getTranslations, getFormatter } from "next-intl/server";
import type { MatchListItem } from "@dragons/shared";
import { ScheduleView } from "@/components/public/schedule/schedule-view";
import type { PublicTeamWithClubFlag } from "@/components/public/schedule/types";
import { getSaturday, getSunday, toDateString } from "@/lib/weekend-utils";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const t = await getTranslations("public");
  const format = await getFormatter();

  const teamParam = typeof params.team === "string" ? params.team : undefined;

  // Calculate the initial weekend (current week's Saturday)
  const saturday = getSaturday(new Date());
  const sunday = getSunday(saturday);

  // Build initial query
  const queryParams = new URLSearchParams({
    dateFrom: toDateString(saturday),
    dateTo: toDateString(sunday),
  });
  if (teamParam) {
    queryParams.set("teamApiId", teamParam);
  }

  const [matchData, allTeams] = await Promise.all([
    fetchAPI<{ items: MatchListItem[] }>(
      `/public/matches?${queryParams}`,
    ).catch(() => ({ items: [] })),
    fetchAPI<PublicTeamWithClubFlag[]>("/public/teams").catch(() => []),
  ]);

  const ownClubTeams = allTeams.filter((team) => team.isOwnClub);

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("schedule")}</h1>

      <ScheduleView
        teams={ownClubTeams}
        initialMatches={matchData.items}
        initialSaturday={toDateString(saturday)}
        formatDate={(date) =>
          format.dateTime(new Date(date + "T12:00:00"), {
            weekday: "long",
            day: "numeric",
            month: "long",
          })
        }
        formatWeekendLabel={(sat, sun) => {
          const satDay = sat.getDate();
          const sunDay = sun.getDate();
          const month = format.dateTime(sat, { month: "short" });
          return `Sa/So ${satDay}/${sunDay} ${month}`;
        }}
        translations={{
          allTeams: t("allTeams"),
          vs: t("vs"),
          matchCancelled: t("matchCancelled"),
          matchForfeited: t("matchForfeited"),
          noMatchesThisWeekend: t("noMatchesThisWeekend"),
        }}
        apiBaseUrl={apiBaseUrl}
      />
    </div>
  );
}
