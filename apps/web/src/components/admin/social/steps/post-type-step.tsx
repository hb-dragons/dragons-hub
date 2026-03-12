"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@dragons/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@dragons/ui/components/card";
import type { WeekendOption } from "../types";

interface PostTypeStepProps {
  resultsOption: WeekendOption | null;
  previewOption: WeekendOption | null;
  loading: boolean;
  error: string | null;
  onSelectCard: (type: "results" | "preview", option: WeekendOption) => void;
  onNavigateWeek: (direction: "prev" | "next") => void;
  canNavigatePrev: boolean;
  canNavigateNext: boolean;
  weekLabel: string;
}

function ActionCard({
  option,
  typeLabel,
  contextLabel,
  countSuffix,
  loading,
  onClick,
}: {
  option: WeekendOption | null;
  typeLabel: string;
  contextLabel: string;
  countSuffix: string;
  loading: boolean;
  onClick: () => void;
}) {
  const disabled = loading || option === null || option.matchCount === 0;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "flex-1 rounded-lg border p-4 text-left transition-colors",
        disabled
          ? "cursor-not-allowed border-border bg-muted/50 opacity-50"
          : "cursor-pointer border-border bg-card hover:border-primary hover:bg-accent/5",
      ].join(" ")}
    >
      <div className="text-base font-bold">{typeLabel}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{contextLabel}</div>
      {loading ? (
        <div className="mt-3 h-5 w-32 animate-pulse rounded bg-muted" />
      ) : option !== null ? (
        <>
          <div className="mt-3 text-sm font-medium">
            KW {option.week} · {option.dateFrom && formatDateRange(option.dateFrom, option.dateTo)}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {option.matchCount} {countSuffix}
          </div>
        </>
      ) : null}
    </button>
  );
}

function formatDateRange(dateFrom: string, dateTo: string): string {
  const monthNames = [
    "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
    "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
  ];
  const sat = new Date(dateFrom + "T12:00:00");
  const sun = new Date(dateTo + "T12:00:00");
  const satMonth = monthNames[sat.getMonth()]!;
  const sunMonth = monthNames[sun.getMonth()]!;
  if (satMonth === sunMonth) {
    return `Sa ${sat.getDate()}. – So ${sun.getDate()}. ${satMonth}`;
  }
  return `Sa ${sat.getDate()}. ${satMonth} – So ${sun.getDate()}. ${sunMonth}`;
}

export function PostTypeStep({
  resultsOption,
  previewOption,
  loading,
  error,
  onSelectCard,
  onNavigateWeek,
  canNavigatePrev,
  canNavigateNext,
  weekLabel,
}: PostTypeStepProps) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Social Post erstellen</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <ActionCard
            option={resultsOption}
            typeLabel="Ergebnisse"
            contextLabel="Letztes Wochenende"
            countSuffix="Spiele mit Ergebnis"
            loading={loading}
            onClick={() => resultsOption && onSelectCard("results", resultsOption)}
          />
          <ActionCard
            option={previewOption}
            typeLabel="Vorschau"
            contextLabel="Kommendes Wochenende"
            countSuffix="Spiele geplant"
            loading={loading}
            onClick={() => previewOption && onSelectCard("preview", previewOption)}
          />
        </div>

        <div className="text-center">
          <button
            type="button"
            onClick={() => setShowPicker((prev) => !prev)}
            className="text-sm text-primary hover:underline"
          >
            {showPicker ? "Standardwoche" : "Andere Woche wählen"}
          </button>
        </div>

        {showPicker && (
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-2 py-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onNavigateWeek("prev")}
              disabled={!canNavigatePrev}
              aria-label="Vorherige Woche"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium">{weekLabel}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onNavigateWeek("next")}
              disabled={!canNavigateNext}
              aria-label="Nächste Woche"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
