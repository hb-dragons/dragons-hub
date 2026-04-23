"use client";

import { useTranslations } from "next-intl";
import { Sheet, SheetContent, SheetTitle } from "@dragons/ui/components/sheet";
import { Badge } from "@dragons/ui/components/badge";
import { X } from "lucide-react";
import { useRefereeHistoryGames } from "@/hooks/use-referee-history";
import type { HistoryLeaderboardEntry } from "@dragons/shared";
import type { HistoryFilterStateWithSearch } from "./filter-state";
import { RefDrawerStats } from "./ref-drawer-stats";
import { RefDrawerGamesList } from "./ref-drawer-games-list";

interface Props {
  entry: HistoryLeaderboardEntry | null;
  filters: HistoryFilterStateWithSearch;
  ownClubLeaderboard: HistoryLeaderboardEntry[];
  onClose: () => void;
}

export function RefDrawer({ entry, filters, ownClubLeaderboard, onClose }: Props) {
  const t = useTranslations("refereeHistory.drawer");

  // SWR hook is called unconditionally (rules of hooks). Use a shape that skips
  // network work when no entry is selected or ref id is unknown.
  const hookRef = entry?.refereeApiId ?? 0;
  const { data } = useRefereeHistoryGames(
    filters,
    entry?.refereeApiId !== undefined && entry.refereeApiId !== null
      ? { refereeApiId: hookRef, limit: 200, offset: 0 }
      : { limit: 0, offset: 0 },
  );

  const ownMax = ownClubLeaderboard.reduce((a, r) => Math.max(a, r.total), 0);
  const ownRank = entry && entry.isOwnClub
    ? {
        rank: ownClubLeaderboard.findIndex(
          (r) => r.refereeApiId === entry.refereeApiId,
        ) + 1,
        of: ownClubLeaderboard.length,
      }
    : null;

  return (
    <Sheet open={entry !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full p-0 sm:max-w-[480px]">
        {entry && (
          <div className="flex h-full flex-col">
            <div className="flex items-start justify-between border-b p-4">
              <div>
                <div className="flex items-center gap-2">
                  <SheetTitle className="font-display text-lg font-bold tracking-tight">
                    {entry.displayName}
                  </SheetTitle>
                  <Badge variant={entry.isOwnClub ? "default" : "outline"} className="text-[10px]">
                    {entry.isOwnClub ? t("ownClub") : t("guest")}
                  </Badge>
                </div>
                <div className="text-muted-foreground text-xs">
                  {filters.dateFrom} → {filters.dateTo}
                  {filters.league ? ` · ${filters.league}` : ""}
                </div>
              </div>
              <button
                data-testid="drawer-close"
                type="button"
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground"
                aria-label={t("close")}
              >
                <X className="size-4" />
              </button>
            </div>
            <RefDrawerStats
              entry={entry}
              games={data?.items ?? []}
              ownClubMaxTotal={ownMax}
              ownClubRank={ownRank}
            />
            <div className="flex-1 overflow-y-auto">
              <RefDrawerGamesList
                games={data?.items ?? []}
                refereeApiId={entry.refereeApiId}
              />
            </div>
            {entry.refereeId !== null && (
              <div className="text-primary border-t p-3 text-right text-xs">
                <a href={`/admin/referees/${entry.refereeId}`} className="hover:underline">
                  {t("openProfile")} →
                </a>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
