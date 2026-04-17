"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { MatchListItem } from "@dragons/shared";
import { ScheduleView } from "./schedule-view";
import { CalendarView } from "./calendar-view";
import { ViewToggle } from "./view-toggle";
import { TeamFilter } from "./team-filter";
import { SubscribeButton } from "./subscribe-button";
import type { PublicTeam } from "./types";

interface SchedulePageClientProps {
  view: "weekend" | "calendar";
  teams: PublicTeam[];
  initialMatches: MatchListItem[];
  initialSaturday: string;
  initialMonth: string;
  translations: {
    allTeams: string;
    vs: string;
    matchCancelled: string;
    matchForfeited: string;
    noMatchesThisWeekend: string;
    noMatchesOnDay: string;
    weekendView: string;
    calendarView: string;
    subscribe: string;
    subscribeTitle: string;
    copy: string;
    copied: string;
    instructionApple: string;
    instructionGoogle: string;
    instructionOutlook: string;
  };
}

export function SchedulePageClient({
  view,
  teams,
  initialMatches,
  initialSaturday,
  initialMonth,
  translations,
}: SchedulePageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const selectedTeamApiId = searchParams.get("team")
    ? Number(searchParams.get("team"))
    : null;

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
    },
    [searchParams, router, startTransition],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <TeamFilter
            teams={teams}
            selectedTeamApiId={selectedTeamApiId}
            onSelect={handleTeamSelect}
            allTeamsLabel={translations.allTeams}
          />
        </div>
        <SubscribeButton
          teamApiId={selectedTeamApiId}
          translations={{
            subscribe: translations.subscribe,
            subscribeTitle: translations.subscribeTitle,
            copy: translations.copy,
            copied: translations.copied,
            instructionApple: translations.instructionApple,
            instructionGoogle: translations.instructionGoogle,
            instructionOutlook: translations.instructionOutlook,
          }}
        />
        <ViewToggle
          view={view}
          weekendLabel={translations.weekendView}
          calendarLabel={translations.calendarView}
        />
      </div>

      {view === "weekend" ? (
        <ScheduleView
          teams={teams}
          initialMatches={initialMatches}
          initialSaturday={initialSaturday}
          translations={{
            vs: translations.vs,
            matchCancelled: translations.matchCancelled,
            matchForfeited: translations.matchForfeited,
            noMatchesThisWeekend: translations.noMatchesThisWeekend,
          }}
        />
      ) : (
        <CalendarView
          teams={teams}
          initialMatches={initialMatches}
          initialMonth={initialMonth}
          translations={{
            vs: translations.vs,
            matchCancelled: translations.matchCancelled,
            matchForfeited: translations.matchForfeited,
            noMatchesOnDay: translations.noMatchesOnDay,
          }}
        />
      )}
    </div>
  );
}
