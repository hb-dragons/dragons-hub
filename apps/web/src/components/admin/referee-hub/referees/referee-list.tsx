"use client";

import { useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { fetchAPI, APIError } from "@/lib/api";
import { Input } from "@dragons/ui/components/input";
import { Checkbox } from "@dragons/ui/components/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@dragons/ui/components/select";
import { cn } from "@dragons/ui/lib/utils";
import type { RefereeListItem, PaginatedResponse } from "@dragons/shared";

type Sort = "name" | "workloadDesc" | "workloadAsc";

interface Props {
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export function RefereeList({ selectedId, onSelect }: Props) {
  const t = useTranslations("refereeHub.referees");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("name");

  const { data } = useSWR<PaginatedResponse<RefereeListItem>>(SWR_KEYS.refereesPaginated({ scope: "own", limit: 50 }), apiFetcher);
  const items = data?.items ?? [];

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = items.filter((r) => !term ||
      (r.firstName ?? "").toLowerCase().includes(term) ||
      (r.lastName ?? "").toLowerCase().includes(term),
    );
    const sorted = [...filtered].sort((a, b) => {
      if (sort === "workloadDesc") return b.matchCount - a.matchCount;
      if (sort === "workloadAsc") return a.matchCount - b.matchCount;
      return (a.lastName ?? "").localeCompare(b.lastName ?? "");
    });
    return sorted;
  }, [items, search, sort]);

  const kpi = useMemo(() => {
    const total = items.reduce((sum, r) => sum + r.matchCount, 0);
    const refs = items.length;
    const avg = refs === 0 ? 0 : Math.round(total / refs);
    return { total, refs, avg };
  }, [items]);

  async function toggleOwnClub(ref: RefereeListItem, checked: boolean) {
    try {
      await fetchAPI(`/admin/referees/${ref.id}/visibility`, {
        method: "PATCH",
        body: JSON.stringify({ isOwnClub: checked, allowAllHomeGames: ref.allowAllHomeGames, allowAwayGames: ref.allowAwayGames }),
      });
      await mutate(SWR_KEYS.refereesPaginated({ scope: "own", limit: 50 }));
    } catch (err) {
      const msg = err instanceof APIError ? err.message : "Failed";
      toast.error(msg);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b grid grid-cols-3 gap-2">
        <Kpi label={t("kpi.total")} value={kpi.total} />
        <Kpi label={t("kpi.refs")} value={kpi.refs} />
        <Kpi label={t("kpi.workload")} value={kpi.avg} />
      </div>
      <div className="p-3 border-b flex gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="name">{t("sort.name")}</SelectItem>
            <SelectItem value="workloadDesc">{t("sort.workloadDesc")}</SelectItem>
            <SelectItem value="workloadAsc">{t("sort.workloadAsc")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex-1 overflow-auto">
        {visible.length === 0 && <div className="p-4 text-sm text-muted-foreground">{t("empty")}</div>}
        {visible.map((r) => (
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
                onCheckedChange={(checked) => toggleOwnClub(r, checked === true)}
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
