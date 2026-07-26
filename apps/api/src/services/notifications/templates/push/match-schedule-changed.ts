import { EVENT_TYPES } from "@dragons/shared";
import type { Locale, PushTemplateOutput } from "./types";
import { BODY_MAX, TITLE_MAX } from "./types";
import { formatDate, truncate } from "./_utils";

/**
 * Canonical `match.schedule.changed` push payload — matches what the emit sites
 * actually publish (matches.sync.ts and match-admin.service.ts), which is a
 * `changes[]` array of kickoff field diffs, NOT flattened old/new kickoff
 * fields. The previous template read `oldKickoffDate`/`oldKickoffTime`/
 * `kickoffTime`, which no producer sends, so rendering it threw inside the push
 * adapter's probe render.
 *
 * `kickoffDate` is only present on the manual-edit path and `matchId` is not
 * published at all today, hence both optional. `eventId` is injected by the
 * dispatcher (renderPushTemplate), not carried in the payload.
 */
export interface MatchScheduleChangedPushPayload {
  matchNo?: number | string;
  matchId?: number | null;
  homeTeam: string;
  guestTeam: string;
  leagueName?: string;
  leagueId?: number | null;
  teamIds?: number[];
  kickoffDate?: string | null;
  changes?: ScheduleFieldChange[];
}

interface ScheduleFieldChange {
  field: string;
  oldValue: string | number | boolean | null;
  newValue: string | number | boolean | null;
}

/** Fallback native route when the event carries no match id. */
const FALLBACK_DEEP_LINK = "/schedule";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const TITLE = {
  de: "📅 Spiel verschoben",
  en: "📅 Match rescheduled",
};

export function renderMatchScheduleChangedPush(
  p: MatchScheduleChangedPushPayload,
  locale: Locale,
): PushTemplateOutput {
  return {
    title: truncate(TITLE[locale], TITLE_MAX),
    body: truncate(bodyFor(p, locale), BODY_MAX),
    data: {
      deepLink: p.matchId != null ? `/game/${p.matchId}` : FALLBACK_DEEP_LINK,
      eventType: EVENT_TYPES.MATCH_SCHEDULE_CHANGED,
    },
  };
}

function bodyFor(p: MatchScheduleChangedPushPayload, locale: Locale): string {
  const matchup = `${p.homeTeam} vs. ${p.guestTeam}`;
  const changes = Array.isArray(p.changes) ? p.changes : [];
  const dateChange = changes.find((c) => c.field === "kickoffDate");
  const timeChange = changes.find((c) => c.field === "kickoffTime");

  const newSide = join(
    formatDatePart(dateChange?.newValue, locale),
    formatTimePart(timeChange?.newValue),
  );
  const oldSide = join(
    formatDatePart(dateChange?.oldValue, locale),
    formatTimePart(timeChange?.oldValue),
  );

  // Every branch below interpolates only values already proven to be non-empty
  // strings, so a missing or partial changes[] degrades to a shorter sentence
  // rather than to "undefined"/"null" in a user-facing push.
  if (!newSide) {
    return locale === "de"
      ? `${matchup}: der Termin wurde geändert.`
      : `${matchup}: the kickoff has changed.`;
  }
  if (!oldSide) {
    return locale === "de"
      ? `${matchup}: neuer Termin ${newSide}.`
      : `${matchup}: new kickoff ${newSide}.`;
  }
  return locale === "de"
    ? `${matchup}: neuer Termin ${newSide} (vorher ${oldSide}).`
    : `${matchup}: new kickoff ${newSide} (was ${oldSide}).`;
}

function join(...parts: string[]): string {
  return parts.filter((s) => s.length > 0).join(" ");
}

/**
 * Producers stringify their change values, but null is a legitimate old/new
 * value (a kickoff that was previously unset). Anything that is not a non-empty
 * string is dropped rather than stringified.
 */
function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Formats ISO dates for the locale; passes anything else (e.g. "TBD") through. */
function formatDatePart(value: unknown, locale: Locale): string {
  const raw = asText(value);
  if (!raw) return "";
  return ISO_DATE.test(raw) ? formatDate(raw, locale) : raw;
}

/** Drops the seconds component so pushes read "17:30", not "17:30:00". */
function formatTimePart(value: unknown): string {
  const raw = asText(value);
  if (!raw) return "";
  return /^\d{2}:\d{2}(:\d{2})?$/.test(raw) ? raw.slice(0, 5) : raw;
}
