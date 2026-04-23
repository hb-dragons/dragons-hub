"use client";

import { useFormatter, useTranslations } from "next-intl";
import { cn } from "@dragons/ui/lib/utils";
import type { HistoryGameItem } from "@dragons/shared";

interface Props {
  games: HistoryGameItem[];
  refereeApiId: number | null;
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function RefDrawerGamesList({ games }: Props) {
  const t = useTranslations("refereeHistory.drawer");
  const format = useFormatter();

  if (games.length === 0) {
    return <div className="text-muted-foreground p-4 text-center text-sm">{t("empty")}</div>;
  }

  const groups = new Map<string, HistoryGameItem[]>();
  for (const g of games) {
    const key = monthKey(g.kickoffDate);
    const arr = groups.get(key) ?? [];
    arr.push(g);
    groups.set(key, arr);
  }

  return (
    <div className="p-4">
      <div className="font-display text-muted-foreground mb-2 text-[10px] font-medium uppercase tracking-wide">
        {t("gamesCount", { count: String(games.length) })}
      </div>
      {[...groups.entries()].map(([month, rows]) => (
        <div key={month} className="mb-4">
          <div className="text-muted-foreground font-display text-[10px] font-medium uppercase tracking-wide">
            {format.dateTime(new Date(month + "-01T00:00:00"), { year: "numeric", month: "long" })}
          </div>
          <div className="mt-1 divide-y">
            {rows.map((g) => (
              <GameRow key={g.id} g={g} t={t} format={format} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function GameRow({
  g,
  t,
  format,
}: {
  g: HistoryGameItem;
  t: ReturnType<typeof useTranslations<"refereeHistory.drawer">>;
  format: ReturnType<typeof useFormatter>;
}) {
  // Role heuristic: backend filters by refereeApiId in SR1 OR SR2; without per-slot
  // api-id on the wire, infer from name presence. Fall back to SR1 when ambiguous.
  const isSr1 = !!g.sr1Name;
  const roleLabel = isSr1 ? t("role.sr1") : t("role.sr2");
  return (
    <div className="flex items-center gap-2 py-2 text-xs">
      <div className="w-16 tabular-nums">
        <div>{format.dateTime(new Date(g.kickoffDate + "T00:00:00"), "matchDate")}</div>
        <div className="text-muted-foreground text-[10px]">{g.kickoffTime.slice(0, 5)}</div>
      </div>
      <div className="flex-1">
        <div className="font-medium">
          {g.homeTeamName} vs {g.guestTeamName}
        </div>
        <div className="text-muted-foreground text-[10px]">
          {g.leagueShort ?? g.leagueName ?? "—"}
        </div>
      </div>
      <span
        className={cn(
          "rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase",
          isSr1 ? "bg-primary text-primary-foreground" : "bg-surface-low text-muted-foreground",
        )}
      >
        {roleLabel}
      </span>
      <StatusPill g={g} />
    </div>
  );
}

function StatusPill({ g }: { g: HistoryGameItem }) {
  const t = useTranslations("refereeHistory.games.statusCell");
  if (g.isCancelled) {
    return (
      <span className="bg-heat text-heat-foreground rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase">
        {t("cancelled")}
      </span>
    );
  }
  if (g.isForfeited) {
    return (
      <span className="bg-heat/70 text-heat-foreground rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase">
        {t("forfeited")}
      </span>
    );
  }
  return (
    <span className="bg-success text-success-foreground rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase">
      {t("played")}
    </span>
  );
}
