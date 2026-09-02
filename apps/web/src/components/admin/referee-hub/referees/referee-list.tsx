"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { SWR_KEYS } from "@/lib/swr-keys";
import { queries } from "@/lib/swr-queries";
import { api, APIError } from "@/lib/api";
import { useRefereeHubUrl } from "../use-referee-hub-url";
import { useDebounce } from "@/hooks/use-debounce";
import { Input } from "@dragons/ui/components/input";
import { Checkbox } from "@dragons/ui/components/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@dragons/ui/components/select";
import { Button } from "@dragons/ui/components/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { cn } from "@dragons/ui/lib/utils";
import type { RefereeListItem } from "@dragons/shared";

interface Props {
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export function RefereeList({ selectedId, onSelect }: Props) {
  const t = useTranslations("refereeHub.referees");
  const { state, update } = useRefereeHubUrl();
  const [searchLocal, setSearchLocal] = useState(state.search);
  const debouncedSearch = useDebounce(searchLocal, 300);

  // Back/forward, or a tab round trip, changes the URL underneath the input;
  // follow it. Derived during render so it never fights a keystroke.
  const [urlSearchSeen, setUrlSearchSeen] = useState(state.search);
  if (state.search !== urlSearchSeen) {
    setUrlSearchSeen(state.search);
    setSearchLocal(state.search);
  }

  useEffect(() => {
    if (debouncedSearch !== state.search) update({ search: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const refereesPaginatedQ = queries.refereesPaginated({
    scope: state.scope,
    search: state.search || undefined,
    sort: state.sort,
    limit: 50,
    offset: 0,
  });
  const listKey = refereesPaginatedQ.key;
  const refereeCountsQ = queries.refereeCounts();

  const { data, error, isLoading, mutate: reloadList } = useSWR(listKey, refereesPaginatedQ.fetcher);
  const { data: counts } = useSWR(SWR_KEYS.refereeCounts, refereeCountsQ.fetcher, { dedupingInterval: 30_000 });
  const items = data?.items ?? [];

  const avg = useMemo(() => {
    if (items.length === 0) return 0;
    return Math.round(items.reduce((s, r) => s + r.matchCount, 0) / items.length);
  }, [items]);

  async function toggleOwnClub(ref: RefereeListItem, checked: boolean) {
    try {
      await api.refereeAdmin.setVisibility(ref.id, {
        isOwnClub: checked,
        allowAllHomeGames: ref.allowAllHomeGames,
        allowAwayGames: ref.allowAwayGames,
      });
      await Promise.all([
        mutate((key) => typeof key === "string" && key.startsWith("/admin/referees?"), undefined, { revalidate: true }),
        mutate(SWR_KEYS.refereeCounts),
      ]);
    } catch (err) {
      toast.error(err instanceof APIError ? err.message : "Failed");
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 space-y-3 bg-surface-low">
        <div className="flex gap-2">
          <Button
            variant={state.scope === "own" ? "default" : "outline"}
            size="sm"
            onClick={() => update({ scope: "own" })}
          >
            {t("scope.own", { n: String(counts?.own ?? "") })}
          </Button>
          <Button
            variant={state.scope === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => update({ scope: "all" })}
          >
            {t("scope.all", { n: String(counts?.all ?? "") })}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Kpi label={t("kpi.ownClubRefs")} value={counts?.own ?? 0} />
          <Kpi label={t("kpi.avgMatches")} value={avg} />
        </div>

        <div className="flex gap-2">
          <Input
            value={searchLocal}
            onChange={(e) => setSearchLocal(e.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
          />
          <Select value={state.sort} onValueChange={(v) => update({ sort: v as never })}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="name">{t("sort.name")}</SelectItem>
              <SelectItem value="workloadDesc">{t("sort.workloadDesc")}</SelectItem>
              <SelectItem value="workloadAsc">{t("sort.workloadAsc")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-surface-low">
        {/* A failed list is not "no referees match your filters". */}
        {error ? (
          <ErrorState className="m-3" onRetry={() => { void reloadList(); }} />
        ) : isLoading && !data ? (
          <LoadingState className="p-3" rows={5} />
        ) : (
          items.length === 0 && <div className="p-4 text-sm text-muted-foreground">{t("empty")}</div>
        )}
        {items.map((r) => (
          <div
            key={r.id}
            role="button"
            tabIndex={0}
            className={cn(
              "grid grid-cols-[1fr_36px_44px] items-center gap-2 px-3 py-2 border-l-2 border-l-transparent cursor-pointer hover:bg-surface-high",
              selectedId === r.id && "bg-primary/10 border-l-primary hover:bg-primary/10",
            )}
            onClick={() => onSelect(r.id)}
            onKeyDown={(e) => {
              // Only act when the row itself is focused — a nested control
              // (the own-club checkbox) handles its own Enter/Space.
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(r.id);
              }
            }}
            data-selected={selectedId === r.id}
          >
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{r.lastName}, {r.firstName}</div>
              <div className="text-xs opacity-70 truncate">
                {t("licenseLabel", { number: r.licenseNumber ?? "—" })}
              </div>
            </div>
            <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
              <Checkbox
                aria-label={t("columns.own")}
                checked={r.isOwnClub}
                onCheckedChange={(checked) => { void toggleOwnClub(r, checked === true); }}
              />
            </div>
            <div className="text-sm text-center tabular-nums">{r.matchCount}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-card p-2 text-center">
      <div className="font-display text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-display text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}
