"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Input } from "@dragons/ui/components/input";
import { useDebounce } from "@/hooks/use-debounce";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { RefereeListView, RefereeScope, RefereeSort } from "./referee-list-query";

interface Props {
  view: RefereeListView;
  onChange: (patch: Partial<RefereeListView>) => void;
  /** Own-club and total referee counts, once known. */
  counts: { own: number; all: number } | null;
  /** Referees matching the current view, once known. */
  total: number | null;
  /** Average games per referee, when every matching referee is loaded. */
  average: number | null;
}

const SORTS: RefereeSort[] = ["name", "workloadDesc", "workloadAsc"];

/** The referee list's controls as one row: search, scope, sort, and a summary. */
export function RefereesToolbar({ view, onChange, counts, total, average }: Props) {
  const t = useTranslations("refereeHub.referees");

  // Typed here, stored in the URL, debounced. Back/forward, or a tab round
  // trip, changes the URL underneath the input; follow it. Derived during
  // render so it never fights a keystroke.
  const [search, setSearch] = useState(view.search);
  const debounced = useDebounce(search, 300);
  const [urlSearchSeen, setUrlSearchSeen] = useState(view.search);
  if (view.search !== urlSearchSeen) {
    setUrlSearchSeen(view.search);
    setSearch(view.search);
  }
  useEffect(() => {
    if (debounced !== view.search) onChange({ search: debounced });
    // Only the debounced text should trigger a write; the other values are read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const scopes: { value: RefereeScope; label: string }[] = (["own", "all"] as const).map((scope) => ({
    value: scope,
    label: counts ? t(`scope.${scope}`, { n: String(counts[scope]) }) : t(`scopePlain.${scope}`),
  }));

  return (
    <div className="bg-surface-low flex flex-wrap items-center gap-2 rounded-md p-3">
      <div className="relative w-full sm:w-60">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
        />
      </div>
      <SegmentedControl label={t("scopeLabel")} value={view.scope} options={scopes} onChange={(scope) => onChange({ scope })} />
      <SegmentedControl
        label={t("sortLabel")}
        value={view.sort}
        options={SORTS.map((s) => ({ value: s, label: t(`sort.${s}`) }))}
        onChange={(sort) => onChange({ sort })}
      />
      {total !== null && (
        <span className="text-muted-foreground ml-auto text-xs tabular-nums">
          {t("summary", { n: total })}
          {average !== null && ` · ${t("average", { avg: average })}`}
        </span>
      )}
    </div>
  );
}
