import type { Locale, PushTemplateOutput } from "./types";
import { BODY_MAX, TITLE_MAX } from "./types";
import { formatDate, truncate } from "./_utils";
import { FALLBACK_DEEP_LINK } from "./referee-assigned";

export interface RefereeSlotsPushPayload {
  /**
   * `referee_games.match_id` — the local `matches` row id. Null until the
   * referee game has been linked to a synced match, hence the fallback below.
   */
  matchId: number | null;
  homeTeam: string;
  guestTeam: string;
  kickoffDate: string;
  kickoffTime: string;
  sr1Open: boolean;
  sr2Open: boolean;
  sr1Assigned: string | null;
  sr2Assigned: string | null;
  reminderLevel?: number;
  eventId: string;
}

/**
 * The whole point of this push is "come claim this game", so it has to land on
 * a screen that can actually claim it. `/game/:id` is a declared expo-router
 * route (`apps/native/src/app/game/[id].tsx`) and renders `<ClaimGameButton>`
 * for signed-in referees. When the referee game has no linked `matches` row
 * there is no id to route by, so fall back to the officiating list.
 */
function refereeSlotsDeepLink(p: Pick<RefereeSlotsPushPayload, "matchId">): string {
  return p.matchId != null ? `/game/${p.matchId}` : FALLBACK_DEEP_LINK;
}

export function renderRefereeSlotsPush(
  p: RefereeSlotsPushPayload,
  locale: Locale,
  variant: "needed" | "reminder",
): PushTemplateOutput {
  return {
    title: truncate(titleFor(locale, variant), TITLE_MAX),
    body: truncate(bodyFor(p, locale, variant), BODY_MAX),
    data: {
      deepLink: refereeSlotsDeepLink(p),
      eventType: variant === "needed" ? "referee.slots.needed" : "referee.slots.reminder",
      eventId: p.eventId,
      matchId: p.matchId,
    },
  };
}

function titleFor(locale: Locale, variant: "needed" | "reminder"): string {
  if (variant === "needed") {
    return locale === "de" ? "🏀 Schiedsrichter gesucht" : "🏀 Referees needed";
  }
  return locale === "de" ? "⚠️ Schiedsrichter benötigt" : "⚠️ Referees still needed";
}

function bodyFor(
  p: RefereeSlotsPushPayload,
  locale: Locale,
  variant: "needed" | "reminder",
): string {
  const openSlots: string[] = [];
  if (p.sr1Open) openSlots.push("SR1");
  if (p.sr2Open) openSlots.push("SR2");
  const slotText = openSlots.join(" + ");
  const matchup = `${p.homeTeam} vs. ${p.guestTeam}`;
  const when = `${formatDate(p.kickoffDate, locale)} ${p.kickoffTime}`;

  if (variant === "needed") {
    return locale === "de"
      ? `${slotText} offen für ${matchup} am ${when}`
      : `${slotText} open for ${matchup} on ${when}`;
  }
  const days = p.reminderLevel ?? 0;
  return locale === "de"
    ? `In ${days} Tagen: ${slotText} noch offen — ${matchup}`
    : `In ${days} days: ${slotText} still open — ${matchup}`;
}

