"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useFormatter } from "next-intl";
import type { MatchListItem } from "@dragons/shared";
import { api } from "@/lib/api";
import { ErrorState } from "@/components/ui/error-state";
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
  const [failed, setFailed] = useState(false);

  const sunday = getSunday(saturday);

  // Rapid paging fires overlapping requests. `requestSeq` is the sequence guard
  // — only the newest request may write state — and the AbortController stops
  // the superseded one from occupying a connection at all.
  const requestSeq = useRef(0);
  const inFlight = useRef<AbortController | null>(null);

  const fetchMatches = useCallback(
    async (sat: Date, teamApiId: number | null) => {
      const sun = getSunday(sat);
      const seq = ++requestSeq.current;
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      setLoading(true);
      try {
        const data = await api.public.getMatches(
          {
            dateFrom: toDateString(sat),
            dateTo: toDateString(sun),
            ...(teamApiId ? { teamApiId } : {}),
          },
          { signal: controller.signal },
        );
        if (seq !== requestSeq.current) return;
        setMatches(data.items ?? []);
        setFailed(false);
      } catch {
        // A stale rejection (including our own abort) must not touch state.
        if (seq !== requestSeq.current) return;
        setFailed(true);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [],
  );

  // Drop the last in-flight request when the view goes away.
  useEffect(() => () => inFlight.current?.abort(), []);

  // Re-fetch when the team filter changes at the page level
  const prevTeamRef = useRef(selectedTeamApiId);
  useEffect(() => {
    if (prevTeamRef.current !== selectedTeamApiId) {
      prevTeamRef.current = selectedTeamApiId;
      void fetchMatches(saturday, selectedTeamApiId);
    }
  }, [selectedTeamApiId, saturday, fetchMatches]);

  const handlePrevious = useCallback(() => {
    const prev = previousSaturday(saturday);
    setSaturday(prev);
    void fetchMatches(prev, selectedTeamApiId);
  }, [saturday, selectedTeamApiId, fetchMatches]);

  const handleNext = useCallback(() => {
    const next = nextSaturday(saturday);
    setSaturday(next);
    void fetchMatches(next, selectedTeamApiId);
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

      {failed ? (
        // A server outage is not an empty weekend — say so, and offer a way back.
        <ErrorState onRetry={() => { void fetchMatches(saturday, selectedTeamApiId); }} />
      ) : (
        <div className={loading ? "opacity-50 transition-opacity" : ""}>
          <MatchList
            matches={matches}
            formatDate={formatDate}
            translations={translations}
          />
        </div>
      )}
    </div>
  );
}
