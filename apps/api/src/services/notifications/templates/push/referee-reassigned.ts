import type { Locale, PushTemplateOutput } from "./types";
import { BODY_MAX, TITLE_MAX } from "./types";
import { truncate } from "./_utils";
import { refereeDeepLink } from "./referee-assigned";

/**
 * Reassignment carries both the outgoing and incoming referee — distinct from
 * RefereeAssignedPayload, which only knows a single referee. Matches the shared
 * refereeReassignedSchema / RefereeReassignedPayload emitted by referees.sync.ts.
 */
export interface RefereeReassignedPushPayload {
  matchNo: number | string;
  homeTeam: string;
  guestTeam: string;
  oldRefereeName: string;
  newRefereeName: string;
  role: string;
  deepLink?: string | null;
}

const TITLE = {
  de: "Einsatz übertragen",
  en: "Assignment reassigned",
};

const BODY = {
  de: (p: RefereeReassignedPushPayload) =>
    `${p.homeTeam} vs. ${p.guestTeam}: ${p.newRefereeName} ersetzt ${p.oldRefereeName} (${p.role}).`,
  en: (p: RefereeReassignedPushPayload) =>
    `${p.homeTeam} vs. ${p.guestTeam}: ${p.newRefereeName} replaces ${p.oldRefereeName} (${p.role}).`,
};

export function renderRefereeReassignedPush(
  payload: RefereeReassignedPushPayload,
  locale: Locale,
): PushTemplateOutput {
  return {
    title: truncate(TITLE[locale], TITLE_MAX),
    body: truncate(BODY[locale](payload), BODY_MAX),
    data: {
      deepLink: refereeDeepLink(payload),
      eventType: "referee.reassigned",
    },
  };
}
