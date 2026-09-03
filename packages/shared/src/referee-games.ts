import type { RefereeSlotStatus } from "./constants";

export interface RefereeGameListItem {
  id: number;
  apiMatchId: number;
  matchId: number | null;
  matchNo: number;
  kickoffDate: string;
  kickoffTime: string;
  homeTeamName: string;
  guestTeamName: string;
  leagueName: string | null;
  leagueShort: string | null;
  venueName: string | null;
  venueCity: string | null;
  homeTeamId: number | null;
  sr1OurClub: boolean;
  sr2OurClub: boolean;
  sr1Name: string | null;
  sr2Name: string | null;
  sr1RefereeApiId: number | null;
  sr2RefereeApiId: number | null;
  sr1Status: RefereeSlotStatus;
  sr2Status: RefereeSlotStatus;
  isCancelled: boolean;
  isForfeited: boolean;
  isTrackedLeague: boolean;
  isHomeGame: boolean;
  isGuestGame: boolean;
  lastSyncedAt: string | null;
  /** 1 or 2 if the currently authenticated referee is assigned to that slot, else null. */
  mySlot: 1 | 2 | null;
  /** Slots the current user is allowed to claim on this game. Empty for admins. */
  claimableSlots: (1 | 2)[];
}

/**
 * The extra facts a referee needs before the game, over and above the list
 * item: where the hall actually is, whether the federation still calls the
 * assignment vorläufig, whether it moved the game after publishing it, and the
 * game's page on the federation portal (#309).
 *
 * Every field is nullable-or-false on purpose. Rows synced before the columns
 * existed carry no address at all, and the screen drops the address line
 * rather than rendering blanks.
 */
export interface RefereeGameBrief {
  venueStreet: string | null;
  venuePostalCode: string | null;
  // No `venueCity` — the list item this extends already carries it, and one
  // fact in two places is one place too many to keep in step.
  /** The federation calls this slot's assignment vorläufig, not fest. */
  sr1Tentative: boolean;
  sr2Tentative: boolean;
  /** The federation moved the venue after publishing the fixture. */
  venueChanged: boolean;
  /** The federation moved the kickoff time after publishing the fixture. */
  timeChanged: boolean;
  /** The game's page on basketball-bund.net. */
  federationUrl: string;
}

/** A single referee game, as `GET /referee/games/:id` returns it. */
export interface RefereeGameDetail extends RefereeGameListItem {
  brief: RefereeGameBrief;
}

/**
 * The game's page in the federation's portal SPA, keyed by the federation's own
 * `spielplanId` (stored as `apiMatchId`). Same `/static/#/<entity>/<id>` shape
 * as the league pages the public site links to.
 */
export function federationGameUrl(apiMatchId: number): string {
  return `https://www.basketball-bund.net/static/#/spiel/${String(apiMatchId)}`;
}
