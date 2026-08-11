import { EVENT_TYPES } from "@dragons/shared";
import type { EventPayload } from "@dragons/shared";
import type { Locale, PushTemplateOutput } from "./types";
import { BODY_MAX, TITLE_MAX } from "./types";
import { formatDatePart, formatTimePart, truncate } from "./_utils";

type MatchCancelledEvent = EventPayload<typeof EVENT_TYPES.MATCH_CANCELLED>;

/**
 * What this template may read, derived from the canonical `match.cancelled`
 * payload schema in `@dragons/shared` — the same one `validateEventPayload`
 * checks at publish time. Naming a field the schema does not declare is a
 * compile error, which is how the previous version of this template went
 * wrong: it required `matchId`/`kickoffDate`/`kickoffTime` that no emit site
 * published, so `formatDate` threw on `undefined.split` during the push
 * adapter's probe render and the notification died in dispatch.
 *
 * Every field except the matchup is optional: `validateEventPayload` only warns,
 * so a producer that omits a declared field still publishes, and the template
 * has to degrade rather than throw.
 */
export type MatchCancelledPushPayload = Partial<MatchCancelledEvent> &
  Pick<MatchCancelledEvent, "homeTeam" | "guestTeam">;

/** Fallback native route when the event carries no match id. */
const FALLBACK_DEEP_LINK = "/schedule";

const TITLE = {
  de: "❌ Spiel abgesagt",
  en: "❌ Match cancelled",
};

export function renderMatchCancelledPush(
  p: MatchCancelledPushPayload,
  locale: Locale,
): PushTemplateOutput {
  return {
    title: truncate(TITLE[locale], TITLE_MAX),
    body: truncate(bodyFor(p, locale), BODY_MAX),
    data: {
      deepLink: p.matchId != null ? `/game/${p.matchId}` : FALLBACK_DEEP_LINK,
      eventType: EVENT_TYPES.MATCH_CANCELLED,
    },
  };
}

function bodyFor(p: MatchCancelledPushPayload, locale: Locale): string {
  const matchup = `${p.homeTeam} vs. ${p.guestTeam}`;
  const kickoff = [formatDatePart(p.kickoffDate, locale), formatTimePart(p.kickoffTime)]
    .filter((part) => part.length > 0)
    .join(" ");

  // Only interpolates values already proven to be non-empty strings, so a
  // kickoff-less payload reads as a shorter sentence, never "(undefined)".
  if (!kickoff) {
    return locale === "de"
      ? `${matchup} wurde abgesagt.`
      : `${matchup} has been cancelled.`;
  }
  return locale === "de"
    ? `${matchup} (${kickoff}) wurde abgesagt.`
    : `${matchup} (${kickoff}) has been cancelled.`;
}
