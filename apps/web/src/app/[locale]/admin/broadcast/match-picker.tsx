"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, Search } from "lucide-react";
import { fetchAPI } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@dragons/ui/components/dialog";
import { Tabs, TabsList, TabsTrigger } from "@dragons/ui/components/tabs";
import { Input } from "@dragons/ui/components/input";
import type { AdminBroadcastMatchListItem } from "@dragons/shared";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (matchId: number) => Promise<void> | void;
}

type Scope = "today" | "all";

export function MatchPicker({ open, onOpenChange, onPick }: Props) {
  const t = useTranslations("broadcast");
  const locale = useLocale();
  const [scope, setScope] = useState<Scope>("today");
  const [q, setQ] = useState("");
  const [list, setList] = useState<AdminBroadcastMatchListItem[]>([]);

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: "short",
        day: "2-digit",
        month: "short",
      }),
    [locale],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const params = new URLSearchParams({ scope });
    if (scope === "all" && q) params.set("q", q);
    fetchAPI<{ matches: AdminBroadcastMatchListItem[] }>(
      `/admin/broadcast/matches?${params.toString()}`,
    ).then((res) => {
      if (!cancelled) setList(res.matches);
    });
    return () => {
      cancelled = true;
    };
  }, [scope, q, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="overflow-hidden sm:max-w-2xl"
        style={{
          maxHeight: "85vh",
          display: "grid",
          gridTemplateRows: "auto auto minmax(0, 1fr)",
          gap: "1rem",
        }}
      >
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-tight">
            {t("pickerTitle")}
          </DialogTitle>
        </DialogHeader>

        <Tabs
          value={scope}
          onValueChange={(v) => setScope(v as Scope)}
          className="gap-3"
        >
          <div className="flex items-center gap-3">
            <TabsList>
              <TabsTrigger value="today">
                <CalendarDays />
                {t("today")}
              </TabsTrigger>
              <TabsTrigger value="all">
                <Search />
                {t("search")}
              </TabsTrigger>
            </TabsList>
            {scope === "all" && (
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("search")}
                className="flex-1"
                autoFocus
              />
            )}
          </div>
        </Tabs>

        <ul
          className="-mx-6 min-h-0 space-y-0.5 overflow-y-auto px-2"
          role="listbox"
          aria-label={t("pickerTitle")}
        >
          {list.length === 0 && (
            <li className="py-8 text-center text-sm text-muted-foreground">
              {scope === "today" ? t("noMatchesToday") : t("noMatchesFound")}
            </li>
          )}
          {list.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => onPick(m.id)}
                className="flex w-full items-center gap-4 rounded-md px-3 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span className="min-w-0 flex-1 truncate font-display text-sm font-bold">
                  {m.homeName}
                  <span className="px-2 font-normal text-muted-foreground">
                    vs
                  </span>
                  {m.guestName}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatDate(dateFmt, m.kickoffDate)} ·{" "}
                  {m.kickoffTime.slice(0, 5)}
                  {m.leagueName ? ` · ${m.leagueName}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function formatDate(fmt: Intl.DateTimeFormat, isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return fmt.format(new Date(y, m - 1, d));
}
