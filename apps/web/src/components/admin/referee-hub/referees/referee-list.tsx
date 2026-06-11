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

  const { data } = useSWR(listKey, refereesPaginatedQ.fetcher);
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
      <div className="p-3 border-b flex gap-2">
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

      <div className="p-3 border-b grid grid-cols-2 gap-2">
        <Kpi label={t("kpi.ownClubRefs")} value={counts?.own ?? 0} />
        <Kpi label={t("kpi.avgMatches")} value={avg} />
      </div>

      <div className="p-3 border-b flex gap-2">
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

      <div className="flex-1 overflow-auto">
        {items.length === 0 && <div className="p-4 text-sm text-muted-foreground">{t("empty")}</div>}
        {items.map((r) => (
          <div
            key={r.id}
            className={cn(
              "grid grid-cols-[1fr_36px_44px] items-center gap-2 px-3 py-2 border-b cursor-pointer hover:bg-muted/40",
              selectedId === r.id && "bg-primary text-primary-foreground hover:bg-primary",
            )}
            onClick={() => onSelect(r.id)}
            data-selected={selectedId === r.id}
          >
            <div>
              <div className="text-sm font-medium">{r.lastName}, {r.firstName}</div>
              <div className="text-xs opacity-70">Lic {r.licenseNumber ?? "—"}</div>
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
    <div className="rounded-md border p-2 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
