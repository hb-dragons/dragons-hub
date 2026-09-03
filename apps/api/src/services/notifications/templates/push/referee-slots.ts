import type { Locale, PushTemplateOutput } from "./types";
import { BODY_MAX, TITLE_MAX } from "./types";
import { formatDate, truncate } from "./_utils";
import { FALLBACK_DEEP_LINK } from "./referee-assigned";

export interface RefereeSlotsPushPayload {
  /**
   * `referee_games.match_id` — the local `matches` row id. Null until the
   * referee game has been linked to a synced match. The push no longer routes
   * by it (#307); it stays on the payload because the WhatsApp and admin
   * renderers read it.
   */
  matchId: number | null;
  /**
   * `referee_games.id` — what the push routes by. Optional only because an
   * event stored before #307 carries no such field; a retry of one of those
   * falls back to the officiating list.
   */
  refereeGameId?: number | null;
  homeTeam: string;
  guestTeam: string;
  kickoffDate: string;
  kickoffTime: string;
  sr1Open: boolean;
  sr2Open: boolean;
  sr1Assigned: string | null;
  sr2Assigned: string | null;
  reminderLevel?: number;
}

/**
 * The whole point of this push is "come claim this game", so it has to land on
 * a screen that can actually claim it — which is now the referee Einsatz
 * screen for every referee game, linked to a synced match or not (#307). It
 * used to route by `matchId` into the fan match screen, which meant a game
 * with no linked `matches` row fell all the way back to the officiating list.
 * `/referee-game/:id` is a declared expo-router route
 * (`apps/native/src/app/referee-game/[id].tsx`) and renders
 * `<ClaimGameButton>`. The fallback remains for events stored before the id
 * was on the payload.
 */
function refereeSlotsDeepLink(
  p: Pick<RefereeSlotsPushPayload, "refereeGameId">,
): string {
  return p.refereeGameId != null
    ? `/referee-game/${p.refereeGameId}`
    : FALLBACK_DEEP_LINK;
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
      // `eventId` is injected by renderPushTemplate — it lives on the dispatch
      // envelope, not in the payload, and no emit site publishes it.
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

