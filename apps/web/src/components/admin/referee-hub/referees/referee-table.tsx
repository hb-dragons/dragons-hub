"use client";

import { useEffect, useRef } from "react";
import { mutate } from "swr";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";
import type { RefereeListItem } from "@dragons/shared";
import { Checkbox } from "@dragons/ui/components/checkbox";
import { cn } from "@dragons/ui/lib/utils";
import { api, APIError } from "@/lib/api";
import { SWR_KEYS } from "@/lib/swr-keys";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";

interface Props {
  referees: RefereeListItem[];
  error: unknown;
  isLoading: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  selectedId: number | null;
  onSelect: (id: number) => void;
}

// Name | own club | home games | away | games | chevron. The two visibility
// columns only fit from md up.
const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_4.5rem_4rem_1rem] md:grid-cols-[minmax(0,1fr)_6rem_7rem_5rem_9rem_1rem] items-center gap-3 px-4";

/**
 * The referees as a full-width table. A row opens the referee's sheet; the
 * own-club checkbox is its own control beside that, not nested inside it.
 */
export function RefereeTable({
  referees,
  error,
  isLoading,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onRetry,
  selectedId,
  onSelect,
}: Props) {
  const t = useTranslations("refereeHub.referees");
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
  }, [hasMore, onLoadMore, referees.length]);

  // A failed list is not "no referees match your filters".
  if (error) return <ErrorState className="m-3" onRetry={onRetry} />;
  if (isLoading) return <LoadingState className="bg-card rounded-md p-3" rows={8} />;
  if (referees.length === 0) {
    return <div className="bg-card text-muted-foreground rounded-md p-10 text-center text-sm">{t("empty")}</div>;
  }

  const maxGames = Math.max(1, ...referees.map((r) => r.matchCount));

  return (
    <div className="bg-card overflow-clip rounded-md">
      <div
        className={cn(
          ROW_GRID,
          "bg-surface-low font-display py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase",
        )}
      >
        <span>{t("columns.ref")}</span>
        <span className="text-center">{t("columns.own")}</span>
        <span className="hidden md:block">{t("columns.home")}</span>
        <span className="hidden md:block">{t("columns.away")}</span>
        <span className="text-right md:text-left">{t("columns.games")}</span>
        <span />
      </div>
      <ul>
        {referees.map((r) => (
          <li key={r.id}>
            <RefereeRow
              referee={r}
              maxGames={maxGames}
              selected={r.id === selectedId}
              onSelect={() => onSelect(r.id)}
            />
          </li>
        ))}
      </ul>
      {hasMore && (
        <div ref={sentinelRef} data-testid="load-more-sentinel" className="text-muted-foreground p-3 text-center text-xs">
          {isLoadingMore ? t("loadingMore") : null}
        </div>
      )}
    </div>
  );
}

function RefereeRow({
  referee: r,
  maxGames,
  selected,
  onSelect,
}: {
  referee: RefereeListItem;
  maxGames: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("refereeHub.referees");

  async function toggleOwnClub(checked: boolean) {
    try {
      await api.refereeAdmin.setVisibility(r.id, {
        isOwnClub: checked,
        allowAllHomeGames: r.allowAllHomeGames,
        allowAwayGames: r.allowAwayGames,
      });
      await Promise.all([
        mutate((key) => typeof key === "string" && key.startsWith("/admin/referees?"), undefined, { revalidate: true }),
        mutate(SWR_KEYS.refereeCounts),
      ]);
    } catch (err) {
      toast.error(err instanceof APIError ? err.message : t("ownClubToggleFailed"));
    }
  }

  return (
    // The name is the row's button, stretched over the whole row with ::after;
    // the checkbox sits above that overlay, so it stays its own control.
    <div
      className={cn(
        ROW_GRID,
        "hover:bg-surface-high relative py-2.5 transition-colors",
        selected && "bg-primary/10 hover:bg-primary/10",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected || undefined}
        className="min-w-0 text-left outline-none after:absolute after:inset-0 focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
      >
        <span className="block truncate text-sm font-semibold">
          {r.lastName}, {r.firstName}
        </span>
        <span className="text-muted-foreground block truncate text-xs">
          {t("licenseLabel", { number: r.licenseNumber ?? "—" })}
        </span>
      </button>
      <span className="relative z-10 flex justify-center">
        <Checkbox
          aria-label={t("columns.own")}
          checked={r.isOwnClub}
          onCheckedChange={(checked) => { void toggleOwnClub(checked === true); }}
        />
      </span>
      <span className="text-muted-foreground hidden text-xs md:block">
        {r.isOwnClub ? t(r.allowAllHomeGames ? "flags.homeAll" : "flags.homeRules") : "—"}
      </span>
      <span className="text-muted-foreground hidden text-xs md:block">
        {r.isOwnClub ? t(r.allowAwayGames ? "flags.awayYes" : "flags.awayNo") : "—"}
      </span>
      <span className="flex items-center justify-end gap-2 md:justify-start">
        <span className="w-6 text-right text-sm tabular-nums">{r.matchCount}</span>
        <span className="bg-muted hidden h-1.5 flex-1 overflow-hidden rounded-full md:block" aria-hidden="true">
          <span className="bg-primary/60 block h-full rounded-full" style={{ width: `${(r.matchCount / maxGames) * 100}%` }} />
        </span>
      </span>
      <ChevronRight className="text-muted-foreground size-4" aria-hidden="true" />
    </div>
  );
}
