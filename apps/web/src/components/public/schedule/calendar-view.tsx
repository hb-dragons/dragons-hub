"use client";

import { useState, useCallback, useMemo, type ButtonHTMLAttributes } from "react";
import { useSearchParams } from "next/navigation";
import { useFormatter } from "next-intl";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { MatchListItem } from "@dragons/shared";
import { getColorPreset } from "@dragons/shared";
import { Calendar } from "@dragons/ui/components/calendar";
import { Button } from "@dragons/ui/components/button";
import { cn } from "@dragons/ui/lib/utils";
import { MatchCard } from "./match-card";
import type { PublicTeam } from "./types";
import { getMonthStart, getMonthEnd, toDateString } from "@/lib/weekend-utils";

interface CalendarViewProps {
  teams: PublicTeam[];
  initialMatches: MatchListItem[];
  initialMonth: string;
  translations: {
    vs: string;
    matchCancelled: string;
    matchForfeited: string;
    noMatchesOnDay: string;
  };
  apiBaseUrl: string;
}

/** Map of date string (YYYY-MM-DD) to matches on that day */
function buildMatchesByDate(matches: MatchListItem[]): Map<string, MatchListItem[]> {
  const map = new Map<string, MatchListItem[]>();
  for (const match of matches) {
    const key = match.kickoffDate;
    const list = map.get(key);
    if (list) {
      list.push(match);
    } else {
      map.set(key, [match]);
    }
  }
  return map;
}

/** Build a lookup from team API permanent ID to dot hex color */
function buildTeamDotMap(teams: PublicTeam[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const team of teams) {
    const preset = getColorPreset(team.badgeColor, team.name);
    map.set(team.apiTeamPermanentId, preset.dot);
  }
  return map;
}

/** Find the own-club team API id for a match */
function getOwnTeamApiIds(match: MatchListItem): number[] {
  const ids: number[] = [];
  if (match.homeIsOwnClub) ids.push(match.homeTeamApiId);
  if (match.guestIsOwnClub) ids.push(match.guestTeamApiId);
  return ids;
}

interface DotInfo {
  color: string;
  played: boolean;
}

/** SVG ring radius and stroke config */
const RING_RADIUS = 15;
const RING_STROKE = 2.5;
const RING_GAP_DEG = 12;
const SVG_SIZE = 40;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Render colored arc segments around a day number */
function DayRing({ dots }: { dots: DotInfo[] }) {
  if (dots.length === 0) return null;

  const n = dots.length;
  const gapDeg = n > 1 ? RING_GAP_DEG : 0;
  const totalGapDeg = gapDeg * n;
  const availableDeg = 360 - totalGapDeg;
  const segmentDeg = availableDeg / n;

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={SVG_SIZE}
      height={SVG_SIZE}
      viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
    >
      {dots.map((dot, i) => {
        const segmentLength = (segmentDeg / 360) * CIRCUMFERENCE;
        const offset = -((segmentDeg + gapDeg) * i / 360) * CIRCUMFERENCE;
        return (
          <circle
            key={i}
            cx={SVG_SIZE / 2}
            cy={SVG_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke={dot.color}
            strokeWidth={RING_STROKE}
            strokeDasharray={`${segmentLength} ${CIRCUMFERENCE - segmentLength}`}
            strokeDashoffset={-offset + CIRCUMFERENCE / 4}
            strokeLinecap="round"
            className={dot.played ? "opacity-35" : undefined}
            style={{
              transform: "rotate(-90deg)",
              transformOrigin: "center",
            }}
          />
        );
      })}
    </svg>
  );
}

export function CalendarView({
  teams,
  initialMatches,
  initialMonth,
  translations,
  apiBaseUrl,
}: CalendarViewProps) {
  const searchParams = useSearchParams();
  const format = useFormatter();

  const teamParam = searchParams.get("team");
  const selectedTeamApiId = teamParam ? Number(teamParam) : null;

  const [month, setMonth] = useState(() => new Date(initialMonth + "T12:00:00"));
  const [matches, setMatches] = useState(initialMatches);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const teamDotMap = useMemo(() => buildTeamDotMap(teams), [teams]);

  const filteredMatches = useMemo(() => {
    if (selectedTeamApiId === null) return matches;
    return matches.filter(
      (m) => m.homeTeamApiId === selectedTeamApiId || m.guestTeamApiId === selectedTeamApiId,
    );
  }, [matches, selectedTeamApiId]);

  const matchesByDate = useMemo(() => buildMatchesByDate(filteredMatches), [filteredMatches]);

  /** Get dot info for a given date */
  const getDotsForDate = useCallback(
    (date: Date): DotInfo[] => {
      const key = toDateString(date);
      const dayMatches = matchesByDate.get(key);
      if (!dayMatches) return [];

      const dots: DotInfo[] = [];
      for (const match of dayMatches) {
        const ownIds = getOwnTeamApiIds(match);
        const played = match.homeScore !== null && match.guestScore !== null;
        for (const id of ownIds) {
          const color = teamDotMap.get(id);
          if (color) {
            dots.push({ color, played });
          }
        }
      }
      return dots;
    },
    [matchesByDate, teamDotMap],
  );

  const fetchMatches = useCallback(
    async (monthDate: Date) => {
      const start = getMonthStart(monthDate);
      const end = getMonthEnd(monthDate);
      const params = new URLSearchParams({
        dateFrom: toDateString(start),
        dateTo: toDateString(end),
      });
      setLoading(true);
      try {
        const res = await fetch(`${apiBaseUrl}/public/matches?${params}`);
        const data = (await res.json()) as { items?: MatchListItem[] };
        setMatches(data.items ?? []);
      } catch {
        setMatches([]);
      } finally {
        setLoading(false);
      }
    },
    [apiBaseUrl],
  );

  const handleMonthChange = useCallback(
    (newMonth: Date) => {
      setMonth(newMonth);
      setSelectedDate(undefined);
      void fetchMatches(newMonth);
    },
    [fetchMatches],
  );

  const goToPreviousMonth = useCallback(() => {
    const prev = new Date(month);
    prev.setMonth(prev.getMonth() - 1);
    handleMonthChange(prev);
  }, [month, handleMonthChange]);

  const goToNextMonth = useCallback(() => {
    const next = new Date(month);
    next.setMonth(next.getMonth() + 1);
    handleMonthChange(next);
  }, [month, handleMonthChange]);

  const monthLabel = useMemo(
    () => format.dateTime(month, { month: "long", year: "numeric" }),
    [month, format],
  );

  const handleDayClick = useCallback((date: Date) => {
    setSelectedDate(date);
  }, []);

  const selectedDateMatches = useMemo(() => {
    if (!selectedDate) return [];
    const key = toDateString(selectedDate);
    return matchesByDate.get(key) ?? [];
  }, [selectedDate, matchesByDate]);

  const selectedDateLabel = useMemo(() => {
    if (!selectedDate) return "";
    return format.dateTime(selectedDate, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }, [selectedDate, format]);

  /** Custom DayButton that renders colored ring segments around the day number */
  const CustomDayButton = useCallback(
    ({
      day,
      children,
      ...buttonProps
    }: {
      day: { date: Date };
      modifiers: Record<string, boolean>;
    } & ButtonHTMLAttributes<HTMLButtonElement>) => {
      const dots = getDotsForDate(day.date);

      return (
        <button
          type="button"
          {...buttonProps}
          className={cn(buttonProps.className, "relative")}
        >
          <span className="relative z-10">{children}</span>
          <DayRing dots={dots} />
        </button>
      );
    },
    [getDotsForDate],
  );

  return (
    <div className="space-y-4">
      {/* Month navigation header */}
      <div className="flex items-center justify-between px-1">
        <Button variant="ghost" size="icon" className="size-8" onClick={goToPreviousMonth}>
          <ChevronLeftIcon className="size-4" />
        </Button>
        <span className="text-sm font-semibold capitalize">{monthLabel}</span>
        <Button variant="ghost" size="icon" className="size-8" onClick={goToNextMonth}>
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>

      <div
        className={cn(
          "flex justify-center",
          loading && "opacity-50",
        )}
      >
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            if (date) handleDayClick(date);
          }}
          month={month}
          onMonthChange={handleMonthChange}
          weekStartsOn={1}
          showOutsideDays
          hideNavigation
          classNames={{
            month_caption: "hidden",
            weekday: "text-muted-foreground rounded-md w-10 font-normal text-[0.8rem]",
            day: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:rounded-full",
            day_button:
              "inline-flex items-center justify-center whitespace-nowrap font-normal focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent/50 hover:text-accent-foreground h-10 w-10 p-0 aria-selected:opacity-100 rounded-full",
            selected:
              "bg-accent font-semibold text-accent-foreground hover:bg-accent focus:bg-accent rounded-full",
            today: "text-primary font-semibold",
            outside: "day-outside text-muted-foreground opacity-30",
            disabled: "text-muted-foreground opacity-50",
            hidden: "invisible",
          }}
          components={{
            DayButton: CustomDayButton,
          }}
        />
      </div>

      {selectedDate && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">{selectedDateLabel}</h3>
          {selectedDateMatches.length === 0 ? (
            <p className="text-sm text-muted-foreground">{translations.noMatchesOnDay}</p>
          ) : (
            <div className="space-y-3">
              {selectedDateMatches.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  translations={translations}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
