import type { RefereeGameListItem } from "@dragons/shared";
import type { RouteHref } from "@/lib/nav/href";

/**
 * The referee Einsatz screen's content, decided outside the screen (#307).
 *
 * Every referee game — own-club or foreign, linked to a synced match or not —
 * opens the same screen. Before #307 an own-club game with a linked match went
 * to the fan match screen instead, which shows score, quarters and form but no
 * officials, so the referee could not see who the co-referee was on exactly
 * the games they were most likely to open. The fan screen is still reachable,
 * as a "Spielinfo" link, and only when a match is actually linked.
 *
 * Which sections render, whether that link exists, and where a referee game
 * routes are decided here as plain functions over the list item the API
 * already returns, so they are testable in the node-only setup and the screen
 * only renders the result.
 */

type EinsatzSlotStatus = RefereeGameListItem["sr1Status"];

export interface EinsatzSlot {
  slot: 1 | 2;
  /** i18n key for the slot's label, e.g. "Schiedsrichter 1". */
  labelKey: string;
  /** The assigned referee, or null when the slot is unfilled. */
  name: string | null;
  status: EinsatzSlotStatus;
  /** The federation owes this slot to our club. */
  ourClub: boolean;
  /** The referee reading the screen holds this slot. */
  isMine: boolean;
}

interface EinsatzDetailRow {
  key: "venue" | "address" | "matchNo";
  labelKey: string;
  value: string;
}

type EinsatzBadge = "cancelled" | "forfeited";

export interface EinsatzView {
  title: string;
  slots: [EinsatzSlot, EinsatzSlot];
  /** The fan match screen, when the referee game is linked to a synced match. */
  spielinfoRoute: RouteHref | null;
  details: EinsatzDetailRow[];
  badges: EinsatzBadge[];
}

/** The route every referee game opens at — the Einsatz screen, always. */
export function refereeGameRoute(game: Pick<RefereeGameListItem, "id">): RouteHref {
  return `/referee-game/${String(game.id)}`;
}

/** The fan match screen for a referee game, or null when nothing is linked. */
export function spielinfoRoute(
  game: Pick<RefereeGameListItem, "matchId">,
): RouteHref | null {
  return game.matchId === null ? null : `/game/${String(game.matchId)}`;
}

export function einsatzView(game: RefereeGameListItem): EinsatzView {
  const details: EinsatzDetailRow[] = [];
  if (game.venueName) {
    details.push({
      key: "venue",
      labelKey: "gameDetail.venue",
      value: game.venueName,
    });
  }
  if (game.venueCity) {
    details.push({
      key: "address",
      labelKey: "gameDetail.address",
      value: game.venueCity,
    });
  }
  details.push({
    key: "matchNo",
    labelKey: "refereeGame.matchNo",
    value: String(game.matchNo),
  });

  const badges: EinsatzBadge[] = [];
  if (game.isCancelled) badges.push("cancelled");
  if (game.isForfeited) badges.push("forfeited");

  return {
    title: `${game.homeTeamName} – ${game.guestTeamName}`,
    slots: [
      {
        slot: 1,
        labelKey: "refereeGame.sr1",
        name: game.sr1Name,
        status: game.sr1Status,
        ourClub: game.sr1OurClub,
        isMine: game.mySlot === 1,
      },
      {
        slot: 2,
        labelKey: "refereeGame.sr2",
        name: game.sr2Name,
        status: game.sr2Status,
        ourClub: game.sr2OurClub,
        isMine: game.mySlot === 2,
      },
    ],
    spielinfoRoute: spielinfoRoute(game),
    details,
    badges,
  };
}
