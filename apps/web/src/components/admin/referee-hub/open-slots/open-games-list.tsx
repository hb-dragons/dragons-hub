"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { useTranslations } from "next-intl";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { Input } from "@dragons/ui/components/input";
import { Badge } from "@dragons/ui/components/badge";
import { cn } from "@dragons/ui/lib/utils";
import type { RefereeGameListItem } from "@dragons/shared";

interface Props {
  selectedGameId: number | null;
  onSelect: (gameId: number) => void;
}

interface ApiResponse { items: RefereeGameListItem[] }

export function OpenGamesList({ selectedGameId, onSelect }: Props) {
  const t = useTranslations("refereeHub.openSlots");
  const [search, setSearch] = useState("");
  const { data } = useSWR<ApiResponse>(SWR_KEYS.refereeGames, apiFetcher);

  const rows = useMemo(() => {
    const items = data?.items ?? [];
    const term = search.trim().toLowerCase();
    return items
      .filter((g) => g.sr1Status === "open" || g.sr2Status === "open")
      .filter((g) => !term ||
        g.homeTeamName.toLowerCase().includes(term) ||
        g.guestTeamName.toLowerCase().includes(term) ||
        (g.leagueShort?.toLowerCase().includes(term) ?? false));
  }, [data, search]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
        />
      </div>
      <div className="flex-1 overflow-auto">
        {rows.map((g) => (
          <button
            key={g.apiMatchId}
            type="button"
            data-selected={selectedGameId === g.apiMatchId}
            onClick={() => onSelect(g.apiMatchId)}
            className={cn(
              "w-full text-left px-3 py-2 border-b hover:bg-muted/50 transition-colors",
              selectedGameId === g.apiMatchId && "bg-primary text-primary-foreground hover:bg-primary",
            )}
          >
            <div className="text-xs opacity-70">
              {g.kickoffDate} · {g.kickoffTime} · {g.leagueShort ?? ""}
            </div>
            <div className="text-sm font-medium">
              {g.homeTeamName} vs {g.guestTeamName}
            </div>
            <div className="flex gap-1 mt-1">
              <SlotBadge status={g.sr1Status} who={g.sr1Name} prefix="SR1" />
              <SlotBadge status={g.sr2Status} who={g.sr2Name} prefix="SR2" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function SlotBadge({ status, who, prefix }: { status: string; who: string | null; prefix: string }) {
  if (status === "assigned") {
    return <Badge variant="secondary">{prefix} {who ?? "?"}</Badge>;
  }
  if (status === "offered") {
    return <Badge variant="outline">{prefix} offered</Badge>;
  }
  return <Badge variant="destructive">{prefix} open</Badge>;
}
