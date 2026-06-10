import type { Locale, PushTemplateOutput } from "./types";
import { BODY_MAX, TITLE_MAX } from "./types";
import { truncate } from "./_utils";
import { refereeDeepLink, type RefereeAssignedPayload } from "./referee-assigned";

const TITLE = {
  de: "Einsatz storniert",
  en: "Assignment cancelled",
};

const BODY = {
  de: (p: RefereeAssignedPayload) =>
    `Dein Einsatz als ${p.role} bei ${p.homeTeam} vs. ${p.guestTeam} wurde storniert.`,
  en: (p: RefereeAssignedPayload) =>
    `Your assignment as ${p.role} for ${p.homeTeam} vs. ${p.guestTeam} has been cancelled.`,
};

export function renderRefereeUnassignedPush(
  payload: RefereeAssignedPayload,
  locale: Locale,
): PushTemplateOutput {
  return {
    title: truncate(TITLE[locale], TITLE_MAX),
    body: truncate(BODY[locale](payload), BODY_MAX),
    data: {
      deepLink: refereeDeepLink(payload),
      eventType: "referee.unassigned",
    },
  };
}

