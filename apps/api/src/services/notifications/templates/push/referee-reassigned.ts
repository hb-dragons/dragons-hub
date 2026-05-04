import type { Locale, PushTemplateOutput } from "./types";
import { BODY_MAX, TITLE_MAX } from "./types";
import { truncate } from "./_utils";
import type { RefereeAssignedPayload } from "./referee-assigned";

const TITLE = {
  de: "Einsatz übertragen",
  en: "Assignment reassigned",
};

const BODY = {
  de: (p: RefereeAssignedPayload) =>
    `Dein Einsatz als ${p.slot} bei ${p.homeTeam} vs. ${p.guestTeam} wurde übertragen.`,
  en: (p: RefereeAssignedPayload) =>
    `Your assignment as ${p.slot} for ${p.homeTeam} vs. ${p.guestTeam} has been reassigned.`,
};

export function renderRefereeReassignedPush(
  payload: RefereeAssignedPayload,
  locale: Locale,
): PushTemplateOutput {
  return {
    title: truncate(TITLE[locale], TITLE_MAX),
    body: truncate(BODY[locale](payload), BODY_MAX),
    data: {
      deepLink: `/referee-game/${payload.matchId}`,
      eventType: "referee.reassigned",
      eventId: payload.eventId,
    },
  };
}

