"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@dragons/ui/components/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@dragons/ui/components/table";
import { ChevronRight } from "lucide-react";
import { cn } from "@dragons/ui/lib/utils";
import type { HistoryLeaderboardEntry } from "@dragons/shared";
import { WorkloadBar } from "./workload-bar";

interface Props {
  variant: "own" | "guest";
  rows: HistoryLeaderboardEntry[];
  onSelect: (refereeApiId: number | null, displayName: string) => void;
  defaultOpen?: boolean;
}

export function LeaderboardSection({ variant, rows, onSelect, defaultOpen }: Props) {
  const t = useTranslations("refereeHistory.leaderboard");
  const format = useFormatter();
  const [open, setOpen] = useState(defaultOpen ?? variant === "own");

  const max = rows.reduce((a, r) => Math.max(a, r.total), 0);
  const heading = variant === "own" ? t("ourRefs") : t("guestRefs");
  const showBar = variant === "own";

  const body = (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10 pl-4 text-right">#</TableHead>
          <TableHead>{t("name")}</TableHead>
          {showBar && <TableHead className="w-[140px]">{t("workload")}</TableHead>}
          <TableHead className="text-right">{t("sr1")}</TableHead>
          <TableHead className="text-right">{t("sr2")}</TableHead>
          <TableHead className="text-right">{t("total")}</TableHead>
          <TableHead className="pr-4">{t("lastRefereed")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={`${row.refereeApiId ?? row.displayName}`}>
            <TableCell className="pl-4 text-right tabular-nums text-muted-foreground">
              {i + 1}
            </TableCell>
            <TableCell>
              <button
                type="button"
                className={cn(
                  "text-left font-medium hover:underline",
                  variant === "own" && "text-primary",
                )}
                onClick={() => onSelect(row.refereeApiId, row.displayName)}
              >
                {row.displayName}
              </button>
            </TableCell>
            {showBar && (
              <TableCell>
                <WorkloadBar total={row.total} max={max} />
              </TableCell>
            )}
            <TableCell className="text-right tabular-nums">{row.sr1Count}</TableCell>
            <TableCell className="text-right tabular-nums">{row.sr2Count}</TableCell>
            <TableCell className="font-display text-right font-bold tabular-nums">
              {row.total}
            </TableCell>
            <TableCell className="text-muted-foreground pr-4 text-xs tabular-nums">
              {row.lastRefereedDate
                ? format.dateTime(new Date(row.lastRefereedDate + "T00:00:00"), "matchDate")
                : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  if (variant === "own") {
    return (
      <section>
        <div className="font-display mb-2 flex items-baseline justify-between text-xs font-bold uppercase tracking-wide">
          <span>{heading} · {rows.length}</span>
        </div>
        <div className="bg-card overflow-hidden rounded-md border">{body}</div>
      </section>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="bg-surface-low flex w-full items-center justify-between rounded-md px-4 py-2.5">
        <span className="font-display text-xs font-bold uppercase tracking-wide">
          {heading} · {rows.length}
        </span>
        <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 rounded-md border bg-card">
        {body}
      </CollapsibleContent>
    </Collapsible>
  );
}
