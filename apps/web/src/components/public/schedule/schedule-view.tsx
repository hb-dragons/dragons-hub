"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter } from "next-intl";
import type { MatchListItem } from "@dragons/shared";
import { TeamFilter } from "./team-filter";
import { WeekendPicker } from "./weekend-picker";
import { MatchList } from "./match-list";
import type { PublicTeam } from "./types";
import {
  getSunday,
  toDateString,
  previousSaturday,
  nextSaturday,
} from "@/lib/weekend-utils";

interface ScheduleViewProps {
  teams: PublicTeam[];
  initialMatches: MatchListItem[];
  initialSaturday: string;
  translations: {
    allTeams: string;
    vs: string;
    matchCancelled: string;
    matchForfeited: string;
    noMatchesThisWeekend: string;
  };
  apiBaseUrl: string;
}

export function ScheduleView({
  teams,
  initialMatches,
  initialSaturday,
  translations,
  apiBaseUrl,
}: ScheduleViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const format = useFormatter();

  const formatDate = useCallback(
    (date: string) =>
      format.dateTime(new Date(date + "T12:00:00"), {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    [format],
  );

  const formatWeekendLabel = useCallback(
    (sat: Date, sun: Date) => {
      const satDay = sat.getDate();
      const sunDay = sun.getDate();
      const month = format.dateTime(sat, { month: "short" });
      return `Sa/So ${satDay}/${sunDay} ${month}`;
    },
    [format],
  );

  const teamParam = searchParams.get("team");
  const selectedTeamApiId = teamParam ? Number(teamParam) : null;

  const [saturday, setSaturday] = useState(() => new Date(initialSaturday + "T12:00:00"));
  const [matches, setMatches] = useState(initialMatches);
  const [loading, setLoading] = useState(false);

  const sunday = getSunday(saturday);

  const fetchMatches = useCallback(
    async (sat: Date, teamApiId: number | null) => {
      const sun = getSunday(sat);
      const params = new URLSearchParams({
        dateFrom: toDateString(sat),
        dateTo: toDateString(sun),
      });
      if (teamApiId) {
        params.set("teamApiId", teamApiId.toString());
      }
      setLoading(true);
      try {
        const res = await fetch(`${apiBaseUrl}/public/matches?${params}`);
        const data = await res.json();
        setMatches(data.items ?? []);
      } catch {
        setMatches([]);
      } finally {
        setLoading(false);
      }
    },
    [apiBaseUrl],
  );

  const handleTeamSelect = useCallback(
    (teamApiId: number | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (teamApiId) {
        params.set("team", teamApiId.toString());
      } else {
        params.delete("team");
      }
      startTransition(() => {
        router.replace(`?${params.toString()}`, { scroll: false });
      });
      fetchMatches(saturday, teamApiId);
    },
    [saturday, searchParams, router, fetchMatches],
  );

  const handlePrevious = useCallback(() => {
    const prev = previousSaturday(saturday);
    setSaturday(prev);
    fetchMatches(prev, selectedTeamApiId);
  }, [saturday, selectedTeamApiId, fetchMatches]);

  const handleNext = useCallback(() => {
    const next = nextSaturday(saturday);
    setSaturday(next);
    fetchMatches(next, selectedTeamApiId);
  }, [saturday, selectedTeamApiId, fetchMatches]);

  const weekendLabel = formatWeekendLabel(saturday, sunday);

  return (
    <div className="space-y-4">
      <TeamFilter
        teams={teams}
        selectedTeamApiId={selectedTeamApiId}
        onSelect={handleTeamSelect}
        allTeamsLabel={translations.allTeams}
      />

      <WeekendPicker
        label={weekendLabel}
        onPrevious={handlePrevious}
        onNext={handleNext}
        hasPrevious={true}
        hasNext={true}
      />

      <div className={loading || isPending ? "opacity-50 transition-opacity" : ""}>
        <MatchList
          matches={matches}
          formatDate={formatDate}
          translations={translations}
        />
      </div>
    </div>
  );
}
