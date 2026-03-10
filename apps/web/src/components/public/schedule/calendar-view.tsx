"use client";

import { useState, useCallback, useMemo, type ButtonHTMLAttributes } from "react";
import { useSearchParams } from "next/navigation";
import { useFormatter } from "next-intl";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { MatchListItem } from "@dragons/shared";
import { getColorPreset } from "@dragons/shared";
import { Calendar } from "@dragons/ui/components/calendar";
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

/** Build a lookup from team API permanent ID to dot color class */
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
  colorClass: string;
  played: boolean;
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
          const colorClass = teamDotMap.get(id);
          if (colorClass) {
            dots.push({ colorClass, played });
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

  /** Custom DayButton that renders dots below the day number */
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
        <button type="button" {...buttonProps}>
          <span className="flex flex-col items-center gap-0.5">
            <span>{children}</span>
            {dots.length > 0 && (
              <span className="flex gap-0.5">
                {dots.map((dot, i) => (
                  <span
                    key={i}
                    className={cn(
                      "size-1.5 rounded-full",
                      dot.colorClass,
                      dot.played && "opacity-40",
                    )}
                  />
                ))}
              </span>
            )}
          </span>
        </button>
      );
    },
    [getDotsForDate],
  );

  return (
    <div className="space-y-4">
      <div className={cn("flex justify-center", loading && "opacity-50 transition-opacity")}>
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            if (date) handleDayClick(date);
          }}
          month={month}
          onMonthChange={handleMonthChange}
          weekStartsOn={1}
          showOutsideDays={false}
          classNames={{
            weekday: "text-muted-foreground rounded-md w-10 font-normal text-[0.8rem]",
            day: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent [&:has([aria-selected])]:rounded-md",
            day_button:
              "inline-flex items-center justify-center whitespace-nowrap font-normal transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-auto min-h-10 w-10 p-1 aria-selected:opacity-100",
            selected:
              "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground rounded-md",
            today: "bg-accent text-accent-foreground rounded-md",
            outside: "day-outside text-muted-foreground opacity-50",
            disabled: "text-muted-foreground opacity-50",
            hidden: "invisible",
          }}
          components={{
            Chevron: ({ orientation }) => {
              const Icon = orientation === "left" ? ChevronLeftIcon : ChevronRightIcon;
              return <Icon className="size-4" />;
            },
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
