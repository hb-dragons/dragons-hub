"use client";

import { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import { FixedSizeList as List, type ListChildComponentProps } from "react-window";
import { useTranslations, useFormatter } from "next-intl";
import { formatKickoff } from "@/lib/format-kickoff";
import { queries } from "@/lib/swr-queries";
import { Input } from "@dragons/ui/components/input";
import { Badge } from "@dragons/ui/components/badge";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { cn } from "@dragons/ui/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import { OPEN_GAMES_PAGE_SIZE } from "./open-games-query";
import type { HubFilters } from "../use-referee-hub-url";

interface Props {
  filters: HubFilters;
  selectedGameId: number | null;
  onSelect: (gameId: number) => void;
  /** Debounced search text, for the URL. */
  onSearch: (search: string) => void;
}

// Each row stacks three lines (date·time·league / teams / the two SR badges),
// so the slot must clear ~76px of content or the badges clip at the bottom.
const ROW_HEIGHT = 80;

/** The server ignores shorter search terms, so the key does too. */
const MIN_SEARCH_LENGTH = 3;

export function OpenGamesList({ filters, selectedGameId, onSelect, onSearch }: Props) {
  const t = useTranslations("refereeHub.openSlots");
  const format = useFormatter();
  const [search, setSearch] = useState(filters.search);
  const debouncedSearch = useDebounce(search, 300);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(400);

  // Back/forward, or a tab round trip, changes the URL underneath the input;
  // follow it. Derived during render so it never fights a keystroke.
  const [urlSearchSeen, setUrlSearchSeen] = useState(filters.search);
  if (filters.search !== urlSearchSeen) {
    setUrlSearchSeen(filters.search);
    setSearch(filters.search);
  }

  useEffect(() => {
    if (debouncedSearch !== filters.search) onSearch(debouncedSearch);
    // Only the debounced text should trigger a write; the other values are read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    setHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const slotStatus =
    filters.status === "open" ? "open" :
    filters.status === "offered" ? "offered" :
    undefined; // "any" → no slotStatus, server returns everything active

  const gamesQ = queries.refereeGamesFiltered({
    status: "active",
    slotStatus,
    league: filters.league,
    dateFrom: filters.dateFrom ?? undefined,
    dateTo: filters.dateTo ?? undefined,
    gameType: filters.gameType,
    search: filters.search.length >= MIN_SEARCH_LENGTH ? filters.search : undefined,
    limit: OPEN_GAMES_PAGE_SIZE,
    offset: 0,
  });

  const { data, error, isLoading, mutate } = useSWR(gamesQ.key, gamesQ.fetcher, {
    dedupingInterval: 5000,
  });

  const rows = data?.items ?? [];

  const Row = ({ index, style }: ListChildComponentProps) => {
    const g = rows[index]!;
    const selected = selectedGameId === g.apiMatchId;
    return (
      <button
        type="button"
        style={style}
        data-selected={selected}
        onClick={() => onSelect(g.apiMatchId)}
        className={cn(
          "w-full text-left px-3 py-2 border-l-2 border-l-transparent hover:bg-surface-high transition-colors block",
          selected && "bg-primary/10 border-l-primary hover:bg-primary/10",
        )}
      >
        <div className="text-xs text-muted-foreground">
          {formatKickoff(format, g.kickoffDate, g.kickoffTime)}
          {g.leagueShort && ` · ${g.leagueShort}`}
        </div>
        <div className="text-sm font-medium truncate">
          {t("matchup", { home: g.homeTeamName, guest: g.guestTeamName })}
        </div>
        <div className="flex gap-1 mt-1">
          <SlotBadge n={1} status={g.sr1Status} who={g.sr1Name} />
          <SlotBadge n={2} status={g.sr2Status} who={g.sr2Name} />
        </div>
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 space-y-2 bg-surface-low">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
        />
        {data && !error && (
          <div className="text-xs text-muted-foreground tabular-nums">
            {t("resultCount", { n: data.total })}
          </div>
        )}
      </div>
      <div ref={containerRef} className="flex-1 min-h-0">
        {error && (
          <ErrorState
            className="m-3"
            description={t("loadError")}
            onRetry={() => { void mutate(); }}
          />
        )}
        {!error && isLoading && !data && <LoadingState className="p-3" rows={5} />}
        {!error && !isLoading && rows.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground text-center">{t("empty")}</div>
        )}
        {rows.length > 0 && (
          <List
            height={height}
            itemCount={rows.length}
            itemSize={ROW_HEIGHT}
            width="100%"
          >
            {Row}
          </List>
        )}
      </div>
    </div>
  );
}

function SlotBadge({ n, status, who }: { n: 1 | 2; status: string; who: string | null }) {
  const t = useTranslations("refereeHub.openSlots.slotBadge");
  if (status === "assigned") return <Badge variant="secondary">{t("assigned", { n, name: who ?? "?" })}</Badge>;
  if (status === "offered") return <Badge variant="outline">{t("offered", { n })}</Badge>;
  return <Badge variant="outline" className="border-transparent bg-heat/15 text-heat">{t("open", { n })}</Badge>;
}
