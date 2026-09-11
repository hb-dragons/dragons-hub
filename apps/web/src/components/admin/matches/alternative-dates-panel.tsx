"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, ClipboardCopy, Info } from "lucide-react";
import { Badge } from "@dragons/ui/components/badge";
import { Button } from "@dragons/ui/components/button";
import { DatePicker } from "@dragons/ui/components/date-picker";
import { Field, FieldLabel } from "@dragons/ui/components/field";
import {
  clubDayAnchor,
  clubTimeAnchor,
  formatKickoffDayShort,
  resolveDateLocale,
} from "@dragons/shared";
import type {
  AlternativeDateCandidate,
  AlternativeDateFlag,
  AlternativeDateGroup,
  AlternativeDatesResponse,
  DateRange,
} from "@dragons/shared";
import { api } from "@/lib/api";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";

/**
 * The badge for one flag, in one place: a third flag type is then one arm here
 * rather than an edit to both the label and the React key.
 */
function describeFlag(
  flag: AlternativeDateFlag,
  t: (key: string, values?: Record<string, string>) => string,
): { key: string; label: string } {
  if (flag.type === "coachCollision") {
    return {
      key: `${flag.type}:${flag.teamEntryName}`,
      label: t("flags.coachCollision", { team: flag.teamEntryName }),
    };
  }
  return { key: flag.type, label: t("flags.outsideRoundWindow") };
}

interface AlternativeDatesPanelProps {
  matchId: number;
  /** The four things the copied reply text names the game by. */
  homeTeamName: string;
  guestTeamName: string;
  leagueName: string | null;
  matchDay: number;
  /**
   * Fills the picked day — and its suggested kickoff, where the finder found
   * one — into the sheet's override fields, then returns to the form. Null
   * when the staff member may not update the match: the list stays theirs to
   * read and to copy, only the form it would write into is not.
   */
  onPrefill: ((date: string, time: string | null) => void) | null;
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
export function AlternativeDatesPanel({
  matchId,
  homeTeamName,
  guestTeamName,
  leagueName,
  matchDay,
  onPrefill,
  onBack,
}: AlternativeDatesPanelProps) {
  const t = useTranslations("matchDetail.alternativeDates");
  const locale = useLocale();
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

  // The server's ranking, not the grouped order on screen: the reply to the
  // other club offers the days best-first, and the piles are a reading aid.
  const ranked = useMemo(
    () => (state.status === "ready" ? state.data.candidates : []),
    [state],
  );

  const copyAsText = useCallback(() => {
    const dateLocale = resolveDateLocale(locale);
    const text = [
      t("copyHeader", {
        home: homeTeamName,
        guest: guestTeamName,
        league: leagueName ?? "—",
        matchDay: String(matchDay),
      }),
      ...ranked.map((c) => `- ${formatKickoffDayShort(c.date, dateLocale)}`),
    ].join("\n");

    navigator.clipboard
      .writeText(text)
      .then(() => toast.success(t("copied")))
      .catch(() => toast.error(t("copyFailed")));
  }, [ranked, locale, t, homeTeamName, guestTeamName, leagueName, matchDay]);

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
        {ranked.length > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={copyAsText}>
            <ClipboardCopy />
            {t("copy")}
          </Button>
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
          groupCandidates(state.data.candidates).map(([group, candidates]) => (
            <section key={group} className="space-y-2">
              <h4 className="font-display text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                {t(`groups.${group}`)}
              </h4>
              <ul className="space-y-1">
                {candidates.map((candidate) => (
                  <li key={candidate.date}>
                    {onPrefill ? (
                      <button
                        type="button"
                        onClick={() =>
                          onPrefill(candidate.date, candidate.suggestedKickoffTime)
                        }
                        className="focus-visible:ring-ring/50 block w-full space-y-1 rounded-md bg-surface-low px-3 py-2 text-left text-sm transition-colors hover:bg-surface-high focus-visible:ring-3 focus-visible:outline-none"
                      >
                        <CandidateDetails candidate={candidate} />
                      </button>
                    ) : (
                      <div className="space-y-1 rounded-md bg-surface-low px-3 py-2 text-sm">
                        <CandidateDetails candidate={candidate} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))
        ))}
    </div>
  );
}

/**
 * One candidate day as it reads on screen, without the element around it: the
 * same lines whether the row is a button that prefills the form or the plain
 * block a staff member without match update sees.
 */
function CandidateDetails({ candidate }: { candidate: AlternativeDateCandidate }) {
  const t = useTranslations("matchDetail.alternativeDates");
  const tStatus = useTranslations("bookings.status");
  const format = useFormatter();

  return (
    <>
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-medium">
          {format.dateTime(clubDayAnchor(candidate.date), "matchDate")}
        </span>
        {candidate.flags.map((flag) => {
          const { key, label } = describeFlag(flag, t);
          return (
            <Badge key={key} variant="secondary">
              {label}
            </Badge>
          );
        })}
      </span>
      {candidate.group === "away" && (
        <span className="text-muted-foreground block text-xs">{t("awayVenue")}</span>
      )}
      {candidate.group === "unbooked" && (
        <span className="text-muted-foreground block text-xs">{t("noBooking")}</span>
      )}
      {candidate.bookings.map((booking) => (
        <span key={booking.id} className="text-muted-foreground block text-xs">
          {format.dateTime(
            clubTimeAnchor(booking.effectiveStartTime, candidate.date),
            "matchTime",
          )}{" "}
          –{" "}
          {format.dateTime(
            clubTimeAnchor(booking.effectiveEndTime, candidate.date),
            "matchTime",
          )}{" "}
          · {tStatus(booking.status)}
          {booking.needsReconfirmation && (
            <>
              {" · "}
              <span className="text-heat">{t("needsReconfirmation")}</span>
            </>
          )}
        </span>
      ))}
      {candidate.suggestedKickoffTime && (
        <span className="block text-xs font-medium">
          {t("suggestedKickoff", {
            time: format.dateTime(
              clubTimeAnchor(candidate.suggestedKickoffTime, candidate.date),
              "matchTime",
            ),
          })}
        </span>
      )}
    </>
  );
}

/** The order the piles are shown in; a pile with no day in it is not shown. */
const GROUP_ORDER: AlternativeDateGroup[] = ["booked", "unbooked", "away"];

/**
 * The candidates split into their piles, each keeping the order the server
 * ranked it in. Every day of a group lands under that group's one heading
 * whatever order the answer arrived in, so a change of ranking on the server
 * can never split a pile into two headings here.
 */
function groupCandidates(
  candidates: AlternativeDateCandidate[],
): [AlternativeDateGroup, AlternativeDateCandidate[]][] {
  return GROUP_ORDER.map(
    (group) =>
      [group, candidates.filter((c) => c.group === group)] as [
        AlternativeDateGroup,
        AlternativeDateCandidate[],
      ],
  ).filter(([, items]) => items.length > 0);
}
