"use client";

import { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import { FixedSizeList as List, type ListChildComponentProps } from "react-window";
import { useTranslations, useFormatter } from "next-intl";
import { formatKickoff } from "@/lib/format-kickoff";
import { queries } from "@/lib/swr-queries";
import { Input } from "@dragons/ui/components/input";
import { Badge } from "@dragons/ui/components/badge";
import { cn } from "@dragons/ui/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import type { HubFilters } from "../use-referee-hub-url";

interface Props {
  filters: HubFilters;
  selectedGameId: number | null;
  onSelect: (gameId: number) => void;
}

const ROW_HEIGHT = 64;

export function OpenGamesList({ filters, selectedGameId, onSelect }: Props) {
  const t = useTranslations("refereeHub.openSlots");
  const format = useFormatter();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(400);

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
    search: debouncedSearch.length >= 3 ? debouncedSearch : undefined,
    limit: 200,
    offset: 0,
  });

  const { data, error, isLoading } = useSWR(gamesQ.key, gamesQ.fetcher, {
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
          "w-full text-left px-3 py-2 hover:bg-surface-high transition-colors block",
          selected && "bg-primary text-primary-foreground hover:bg-primary",
        )}
      >
        <div className="text-xs opacity-70">
          {formatKickoff(format, g.kickoffDate, g.kickoffTime)} · {g.leagueShort ?? ""}
        </div>
        <div className="text-sm font-medium truncate">{g.homeTeamName} vs {g.guestTeamName}</div>
        <div className="flex gap-1 mt-1">
          <SlotBadge status={g.sr1Status} who={g.sr1Name} prefix="SR1" />
          <SlotBadge status={g.sr2Status} who={g.sr2Name} prefix="SR2" />
        </div>
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 bg-surface-low">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
        />
      </div>
      <div ref={containerRef} className="flex-1 min-h-0">
        {error && <div className="p-4 text-sm text-destructive">{t("loadError")}</div>}
        {isLoading && !data && <div className="p-4 text-sm text-muted-foreground">{t("loading")}</div>}
        {!isLoading && rows.length === 0 && (
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

function SlotBadge({ status, who, prefix }: { status: string; who: string | null; prefix: string }) {
  if (status === "assigned") return <Badge variant="secondary">{prefix} {who ?? "?"}</Badge>;
  if (status === "offered") return <Badge variant="outline">{prefix} offered</Badge>;
  return <Badge variant="destructive">{prefix} open</Badge>;
}
