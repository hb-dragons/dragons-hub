"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { useTranslations } from "next-intl";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { useDebounce } from "@/hooks/use-debounce";
import { Input } from "@dragons/ui/components/input";
import { Button } from "@dragons/ui/components/button";
import { Badge } from "@dragons/ui/components/badge";
import { cn } from "@dragons/ui/lib/utils";
import type { CandidateSearchResponse } from "@dragons/shared";

type RefCandidate = CandidateSearchResponse["results"][number];

interface Props {
  gameApiId: number;
  slotNumber: 1 | 2;
  onPick: (refereeApiId: number) => void;
  disabled?: boolean;
}

function getBlockReason(
  c: RefCandidate,
  slot: 1 | 2,
  tDisposition: (k: "notQualifiedSr1" | "notQualifiedSr2" | "modeMismatchSr1" | "modeMismatchSr2" | "blocked") => string,
): string | null {
  if (slot === 1 && !c.qualiSr1) return tDisposition("notQualifiedSr1");
  if (slot === 2 && !c.qualiSr2) return tDisposition("notQualifiedSr2");
  if (slot === 1 && c.srModusMismatchSr1) return tDisposition("modeMismatchSr1");
  if (slot === 2 && c.srModusMismatchSr2) return tDisposition("modeMismatchSr2");
  if (c.blocktermin) return tDisposition("blocked");
  if (c.zeitraumBlockiert) return c.zeitraumBlockiert;
  return null;
}

export function CandidatePicker({ gameApiId, slotNumber, onPick, disabled }: Props) {
  const t = useTranslations("refereeHub.openSlots.picker");
  const tDisposition = useTranslations("refereeHub.openSlots.picker.disposition");
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 300);
  const [page, setPage] = useState(0);

  const { data } = useSWR<CandidateSearchResponse>(
    SWR_KEYS.refereeCandidates(gameApiId, debounced, page, slotNumber),
    apiFetcher,
  );

  const results = data?.results ?? [];
  const hasMore = useMemo(() => {
    if (!data) return false;
    return (page + 1) * 15 < data.total;
  }, [data, page]);

  return (
    <div className="space-y-2">
      <Input
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchPlaceholder")}
      />
      {results.length === 0 && (
        <div className="text-sm text-muted-foreground py-3 text-center">{t("empty")}</div>
      )}
      <div className="space-y-1">
        {results.map((c) => {
          const blockReason = getBlockReason(c, slotNumber, tDisposition);
          const blocked = blockReason !== null;
          const displayName = `${c.vorname} ${c.nachName}`.trim();
          return (
            <div
              key={c.srId}
              data-testid="candidate-row"
              data-candidate
              data-disabled={blocked}
              className={cn(
                "flex items-center justify-between p-2 border rounded-md gap-2",
                blocked && "opacity-50",
              )}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{displayName}</div>
                <div className="text-xs text-muted-foreground flex gap-2 items-center flex-wrap">
                  <Badge variant="outline">{t("workload", { n: String(c.meta.total) })}</Badge>
                  {blocked && (
                    <span className="text-destructive">{blockReason}</span>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="default"
                disabled={blocked || disabled}
                onClick={() => onPick(c.srId)}
              >
                {t("assign", { n: String(slotNumber) })}
              </Button>
            </div>
          );
        })}
      </div>
      {hasMore && (
        <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} className="w-full">
          {t("loadMore")}
        </Button>
      )}
    </div>
  );
}
