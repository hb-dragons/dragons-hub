import { EVENT_TYPES } from "@dragons/shared";
import type { EventPayload } from "@dragons/shared";
import type { Locale, PushTemplateOutput } from "./types";
import { BODY_MAX, TITLE_MAX } from "./types";
import { formatDatePart, formatTimePart, truncate } from "./_utils";

type MatchScheduleChangedEvent = EventPayload<typeof EVENT_TYPES.MATCH_SCHEDULE_CHANGED>;

/**
 * What this template may read, derived from the canonical
 * `match.schedule.changed` payload schema in `@dragons/shared` — so it cannot
 * name a field the emit sites (matches.sync.ts, match-admin.service.ts) are not
 * contracted to publish. The previous template read `oldKickoffDate`/
 * `oldKickoffTime`/`kickoffTime`, which no producer sends (they publish a
 * `changes[]` array of kickoff field diffs), so rendering it threw inside the
 * push adapter's probe render.
 *
 * Every field except the matchup is optional: `validateEventPayload` only warns,
 * so a producer that omits a declared field still publishes, and the template
 * has to degrade rather than throw. `eventId` is injected by the dispatcher
 * (renderPushTemplate), not carried in the payload.
 */
export type MatchScheduleChangedPushPayload = Partial<MatchScheduleChangedEvent> &
  Pick<MatchScheduleChangedEvent, "homeTeam" | "guestTeam">;

/** Fallback native route when the event carries no match id. */
const FALLBACK_DEEP_LINK = "/schedule";

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
