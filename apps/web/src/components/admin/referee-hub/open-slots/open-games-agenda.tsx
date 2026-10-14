"use client";

import { useEffect, useRef } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { clubDayAnchor, daysUntilKickoff, type RefereeGameListItem } from "@dragons/shared";
import { cn } from "@dragons/ui/lib/utils";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { openSlotCount, ourSlots, ownSide } from "./open-game-facts";

/** Kickoffs this close count as urgent and get the heat colour. */
const URGENT_DAYS = 7;

interface Props {
  games: RefereeGameListItem[];
  error: unknown;
  isLoading: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  selectedGameId: number | null;
  onSelect: (apiMatchId: number) => void;
}

/**
 * The open games as an agenda: one block per match day under a sticky
 * heading, one dense line per game. The list keeps the page's full width;
 * staffing a game opens a sheet over it.
 */
export function OpenGamesAgenda({
  games,
  error,
  isLoading,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onRetry,
  selectedGameId,
  onSelect,
}: Props) {
  const t = useTranslations("refereeHub.openSlots");
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Ask for the next page as the end of the list scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) onLoadMore();
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, onLoadMore, games.length]);

  if (error) {
    return <ErrorState className="m-3" description={t("loadError")} onRetry={onRetry} />;
  }
  if (isLoading) {
    return <LoadingState className="bg-card rounded-md p-3" rows={6} />;
  }
  if (games.length === 0) {
    return <div className="bg-card text-muted-foreground rounded-md p-10 text-center text-sm">{t("empty")}</div>;
  }

  return (
    // overflow-clip, not -hidden: the rounded corners must not turn this into
    // the scroll container, or the sticky day headings would never stick.
    <div className="bg-card overflow-clip rounded-md">
      {groupByDay(games).map(([date, dayGames]) => (
        <section key={date} aria-labelledby={`day-${date}`}>
          <DayHeading id={`day-${date}`} date={date} openSlots={dayGames.reduce((n, g) => n + openSlotCount(g), 0)} />
          <ul>
            {dayGames.map((g) => (
              <li key={g.apiMatchId}>
                <AgendaRow game={g} selected={g.apiMatchId === selectedGameId} onSelect={() => onSelect(g.apiMatchId)} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {hasMore && (
        <div ref={sentinelRef} data-testid="load-more-sentinel" className="text-muted-foreground p-3 text-center text-xs">
          {isLoadingMore ? t("loadingMore") : null}
        </div>
      )}
    </div>
  );
}

function DayHeading({ id, date, openSlots }: { id: string; date: string; openSlots: number }) {
  const t = useTranslations("refereeHub.openSlots.agenda");
  const format = useFormatter();
  const days = daysUntilKickoff(date);
  return (
    <h3
      id={id}
      className={cn(
        "bg-surface-low font-display sticky top-0 z-10 flex flex-wrap items-baseline gap-x-3 px-4 py-2 text-xs font-medium tracking-wide uppercase",
        days >= 0 && days <= URGENT_DAYS ? "text-heat" : "text-muted-foreground",
      )}
    >
      {format.dateTime(clubDayAnchor(date), { weekday: "long", day: "numeric", month: "long" })}
      <span className="font-sans tracking-normal normal-case opacity-80">
        {days >= 0 ? t("relativeDay", { days }) : t("daysAgo", { days: -days })}
      </span>
      <span className="ml-auto font-sans tracking-normal normal-case">{t("dayOpenSlots", { n: openSlots })}</span>
    </h3>
  );
}

function AgendaRow({ game: g, selected, onSelect }: { game: RefereeGameListItem; selected: boolean; onSelect: () => void }) {
  const t = useTranslations("refereeHub.openSlots.agenda");
  const side = ownSide(g);
  const open = openSlotCount(g);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected || undefined}
      className={cn(
        "hover:bg-surface-high grid w-full grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left transition-colors md:grid-cols-[3.5rem_minmax(0,1fr)_6rem_5.5rem_minmax(0,16rem)_auto]",
        selected && "bg-primary/10 hover:bg-primary/10",
      )}
    >
      <span className="font-mono text-sm tabular-nums">{g.kickoffTime.slice(0, 5)}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{side.own}</span>
        <span className="text-muted-foreground block truncate text-xs">
          {t(side.home ? "against" : "at", { opponent: side.opponent })}
        </span>
      </span>
      <span className="text-muted-foreground hidden truncate text-xs md:block" title={g.leagueName ?? undefined}>
        {g.leagueShort}
      </span>
      <span className="hidden text-xs md:block">{t(side.home ? "home" : "away")}</span>
      <span className="hidden min-w-0 gap-3 md:flex">
        {ourSlots(g).map((s) => (
          <span key={s.n} className="flex min-w-0 items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">{t("slotShort", { n: s.n })}</span>
            {s.status === "assigned" ? (
              <span className="truncate">{s.name}</span>
            ) : (
              <span className={s.status === "open" ? "text-heat font-medium" : "text-muted-foreground"}>
                {t(s.status === "open" ? "slotOpen" : "slotOffered")}
              </span>
            )}
          </span>
        ))}
      </span>
      <span className="justify-self-end">
        {open > 0 ? (
          <span className="bg-heat/15 text-heat rounded-4xl px-2 py-0.5 text-xs font-medium whitespace-nowrap">
            {t("openCount", { n: open })}
          </span>
        ) : (
          <span className="bg-primary/15 text-primary rounded-4xl px-2 py-0.5 text-xs font-medium">{t("staffed")}</span>
        )}
      </span>
    </button>
  );
}

function groupByDay(games: RefereeGameListItem[]): [string, RefereeGameListItem[]][] {
  const days = new Map<string, RefereeGameListItem[]>();
  for (const g of games) {
    const day = days.get(g.kickoffDate);
    if (day) day.push(g);
    else days.set(g.kickoffDate, [g]);
  }
  return [...days.entries()];
}
