"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowLeft, Info } from "lucide-react";
import { Badge } from "@dragons/ui/components/badge";
import { Button } from "@dragons/ui/components/button";
import { DatePicker } from "@dragons/ui/components/date-picker";
import { Field, FieldLabel } from "@dragons/ui/components/field";
import { clubDayAnchor } from "@dragons/shared";
import type { AlternativeDatesResponse, DateRange } from "@dragons/shared";
import { api } from "@/lib/api";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";

interface AlternativeDatesPanelProps {
  matchId: number;
  /** Returns the sheet to the match form. */
  onBack: () => void;
}

/** What the staff member asked for, as opposed to the range the server used. */
type RequestedRange = DateRange | null;

type PanelState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: AlternativeDatesResponse };

/**
 * The weekend days a game could move to, for the mail back to the other club.
 *
 * The range is the server's to fill in: the panel asks with no range at all on
 * first load and shows back whatever range the answer was computed over, so the
 * pickers never claim a season window the finder did not actually walk.
 */
export function AlternativeDatesPanel({ matchId, onBack }: AlternativeDatesPanelProps) {
  const t = useTranslations("matchDetail.alternativeDates");
  const format = useFormatter();
  const fieldIds = useId();
  const [requested, setRequested] = useState<RequestedRange>(null);
  // Bumped to re-run the effect after a failure; its value is never read.
  const [retryNonce, setRetryNonce] = useState(0);
  const [state, setState] = useState<PanelState>({ status: "loading" });

  // The loading state is set by whatever triggered the fetch — a range pick or
  // the retry button — never by this effect: a synchronous setState here would
  // cascade a second render on every run.
  useEffect(() => {
    let cancelled = false;

    api.matches
      .alternativeDates(matchId, requested ?? undefined)
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [matchId, requested, retryNonce]);

  const effective = state.status === "ready" ? state.data.range : null;
  const from = requested?.from ?? effective?.from ?? null;
  const to = requested?.to ?? effective?.to ?? null;

  // A backwards range is a 400 from the API, so the picker that would create
  // one drags the other end along instead of asking for a range that cannot be.
  const pickFrom = useCallback(
    (value: string | null) => {
      if (!value || !to) return;
      setState({ status: "loading" });
      setRequested({ from: value, to: value > to ? value : to });
    },
    [to],
  );

  const pickTo = useCallback(
    (value: string | null) => {
      if (!value || !from) return;
      setState({ status: "loading" });
      setRequested({ from: value < from ? value : from, to: value });
    },
    [from],
  );

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setRetryNonce((n) => n + 1);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4">
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="icon-sm" onClick={onBack}>
          <ArrowLeft />
          <span className="sr-only">{t("back")}</span>
        </Button>
        <h3 className="font-display text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          {t("title")}
        </h3>
        {state.status === "ready" && (
          <Badge variant="outline" className="ml-auto">
            {state.data.isHomeGame ? t("homeGame") : t("awayGame")}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${fieldIds}-from`}>{t("from")}</FieldLabel>
          <DatePicker
            id={`${fieldIds}-from`}
            value={from}
            onChange={pickFrom}
            className="h-9 w-full"
            disabled={from === null}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${fieldIds}-to`}>{t("to")}</FieldLabel>
          <DatePicker
            id={`${fieldIds}-to`}
            value={to}
            onChange={pickTo}
            className="h-9 w-full"
            disabled={to === null}
          />
        </Field>
      </div>

      {state.status === "ready" &&
        state.data.caveats.map((caveat) => (
          <p
            key={caveat}
            className="text-muted-foreground flex items-start gap-2 text-sm"
          >
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t(`caveats.${caveat}`)}
          </p>
        ))}

      {state.status === "loading" && <LoadingState rows={4} label={t("loading")} />}

      {state.status === "error" && (
        <ErrorState
          description={t("error")}
          onRetry={retry}
        />
      )}

      {state.status === "ready" &&
        (state.data.candidates.length === 0 ? (
          <p className="text-muted-foreground rounded-md bg-surface-low p-6 text-center text-sm">
            {t("empty")}
          </p>
        ) : (
          <ul className="space-y-1">
            {state.data.candidates.map((candidate) => (
              <li
                key={candidate.date}
                className="rounded-md bg-surface-low px-3 py-2 text-sm font-medium"
              >
                {format.dateTime(clubDayAnchor(candidate.date), "matchDate")}
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
