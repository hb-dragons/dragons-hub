"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useFormatter } from "next-intl";
import type { MatchListItem } from "@dragons/shared";
import { publicApi } from "@/lib/api-client";
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
    vs: string;
    matchCancelled: string;
    matchForfeited: string;
    noMatchesThisWeekend: string;
  };
}

export function ScheduleView({
  initialMatches,
  initialSaturday,
  translations,
}: ScheduleViewProps) {
  const searchParams = useSearchParams();
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

  const [saturday, setSaturday] = useState(
    () => new Date(initialSaturday + "T12:00:00"),
  );
  const [matches, setMatches] = useState(initialMatches);
  const [loading, setLoading] = useState(false);

  const sunday = getSunday(saturday);

  const fetchMatches = useCallback(
    async (sat: Date, teamApiId: number | null) => {
      const sun = getSunday(sat);
      setLoading(true);
      try {
        const data = await publicApi.getMatches({
          dateFrom: toDateString(sat),
          dateTo: toDateString(sun),
          ...(teamApiId ? { teamApiId } : {}),
        });
        setMatches(data.items ?? []);
      } catch {
        setMatches([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Re-fetch when the team filter changes at the page level
  const prevTeamRef = useRef(selectedTeamApiId);
  useEffect(() => {
    if (prevTeamRef.current !== selectedTeamApiId) {
      prevTeamRef.current = selectedTeamApiId;
      fetchMatches(saturday, selectedTeamApiId);
    }
  }, [selectedTeamApiId, saturday, fetchMatches]);

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
      <WeekendPicker
        label={weekendLabel}
        onPrevious={handlePrevious}
        onNext={handleNext}
        hasPrevious={true}
        hasNext={true}
      />

      <div className={loading ? "opacity-50 transition-opacity" : ""}>
        <MatchList
          matches={matches}
          formatDate={formatDate}
          translations={translations}
        />
      </div>
    </div>
  );
}
