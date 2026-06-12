"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useDebounce } from "@/hooks/use-debounce";
import { Input } from "@dragons/ui/components/input";
import { Button } from "@dragons/ui/components/button";
import { Badge } from "@dragons/ui/components/badge";
import { cn } from "@dragons/ui/lib/utils";
import { getBlockReason, type BlockReason, type RefCandidate } from "./candidate-block-reason";
import { useCandidateSearch } from "./use-candidate-search";

interface Props {
  gameApiId: number;
  slotNumber: 1 | 2;
  onPick: (refereeApiId: number) => void;
  disabled?: boolean;
}

type DispositionKey =
  | "notQualifiedSr1"
  | "notQualifiedSr2"
  | "modeMismatchSr1"
  | "modeMismatchSr2"
  | "blocked";

function blockReasonText(reason: BlockReason, t: (k: DispositionKey) => string): string {
  switch (reason.kind) {
    case "notQualified":
      return t(reason.slot === 1 ? "notQualifiedSr1" : "notQualifiedSr2");
    case "modeMismatch":
      return t(reason.slot === 1 ? "modeMismatchSr1" : "modeMismatchSr2");
    case "blocked":
      return t("blocked");
    case "zeitraum":
      return reason.text;
  }
}

export function CandidatePicker({ gameApiId, slotNumber, onPick, disabled }: Props) {
  const t = useTranslations("refereeHub.openSlots.picker");
  const tDisposition = useTranslations("refereeHub.openSlots.picker.disposition");
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 300);
  const [showIneligible, setShowIneligible] = useState(false);
  const { candidates, hasMore, isLoadingMore, loadMore } = useCandidateSearch(
    gameApiId,
    slotNumber,
    debounced,
  );

  const rows = candidates.map((c) => ({ c, reason: getBlockReason(c, slotNumber) }));
  const eligible = rows.filter((r) => r.reason === null);
  const ineligible = rows.filter((r) => r.reason !== null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  const renderRow = (c: RefCandidate, reasonText: string | null) => {
    const blocked = reasonText !== null;
    const displayName = `${c.vorname} ${c.nachName}`.trim();
    return (
      <div
        key={c.srId}
        data-testid="candidate-row"
        data-candidate
        data-disabled={blocked}
        className={cn(
          "flex items-center justify-between p-2 rounded-md gap-2 hover:bg-accent",
          blocked && "opacity-50",
        )}
      >
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{displayName}</div>
          <div className="text-xs text-muted-foreground flex gap-2 items-center flex-wrap">
            <Badge variant="outline">{t("workload", { n: String(c.meta.total) })}</Badge>
            {blocked && <span className="text-destructive">{reasonText}</span>}
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
  };

  return (
    <div className="space-y-2">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchPlaceholder")}
        autoFocus
      />
      <div className="max-h-80 overflow-y-auto space-y-1">
        {eligible.length === 0 && !isLoadingMore && (
          <div className="text-sm text-muted-foreground py-3 text-center">{t("empty")}</div>
        )}
        {eligible.map(({ c }) => renderRow(c, null))}
        {ineligible.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={() => setShowIneligible((v) => !v)}
          >
            {showIneligible
              ? t("hideIneligible")
              : t("showIneligible", { n: String(ineligible.length) })}
          </Button>
        )}
        {showIneligible &&
          ineligible.map(({ c, reason }) =>
            renderRow(c, reason === null ? null : blockReasonText(reason, tDisposition)),
          )}
        {isLoadingMore && (
          <div className="text-xs text-muted-foreground py-2 text-center">{t("loadingMore")}</div>
        )}
        {hasMore && <div ref={sentinelRef} data-testid="scroll-sentinel" className="h-px" />}
      </div>
    </div>
  );
}
