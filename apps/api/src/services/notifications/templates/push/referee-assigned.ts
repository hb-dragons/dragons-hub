import type { Locale, PushTemplateOutput } from "./types";
import { BODY_MAX, TITLE_MAX } from "./types";
import { formatDate, truncate } from "./_utils";

/**
 * Canonical referee push payload — matches what the emit sites publish
 * (referee-assignment.service.ts, referees.sync.ts) and the shared
 * refereeAssignmentSchema. `matchId`/`kickoff*`/`deepLink` are optional because
 * the sync path cannot always provide them. `eventId` is injected by the
 * dispatcher (renderPushTemplate), not carried in the payload.
 */
export interface RefereeAssignedPayload {
  matchId?: number | null;
  matchNo: number | string;
  homeTeam: string;
  guestTeam: string;
  refereeName?: string;
  role: string;
  kickoffDate?: string | null;
  kickoffTime?: string | null;
  deepLink?: string | null;
}

/** Fallback native route when the event carries no explicit deep link. */
const FALLBACK_DEEP_LINK = "/officiating";

export function refereeDeepLink(payload: RefereeAssignedPayload): string {
  return payload.deepLink ?? FALLBACK_DEEP_LINK;
}

function kickoffSuffix(payload: RefereeAssignedPayload, locale: Locale): string {
  if (!payload.kickoffDate || !payload.kickoffTime) return "";
  const date = formatDate(payload.kickoffDate, locale);
  const time = payload.kickoffTime.slice(0, 5);
  return locale === "de" ? ` am ${date} um ${time}` : ` on ${date} at ${time}`;
}

const TITLE = {
  de: "🏀 Schiedsrichter zugewiesen",
  en: "🏀 Referee assigned",
};

const BODY = {
  de: (p: RefereeAssignedPayload) =>
    `Du wurdest als ${p.role} für ${p.homeTeam} vs. ${p.guestTeam}${kickoffSuffix(p, "de")} eingesetzt.`,
  en: (p: RefereeAssignedPayload) =>
    `You've been assigned as ${p.role} for ${p.homeTeam} vs. ${p.guestTeam}${kickoffSuffix(p, "en")}.`,
};

export function renderRefereeAssignedPush(
  payload: RefereeAssignedPayload,
  locale: Locale,
): PushTemplateOutput {
  return {
    title: truncate(TITLE[locale], TITLE_MAX),
    body: truncate(BODY[locale](payload), BODY_MAX),
    data: {
      deepLink: refereeDeepLink(payload),
      eventType: "referee.assigned",
    },
  };
}
