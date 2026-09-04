import type { RefereeSlotStatus } from "./constants";
import type { TeamStaffRole } from "./teams";

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

/** The three Kampfgericht roles a Dragons team is named for on a home game. */
export const KAMPFGERICHT_ROLES = ["anschreiber", "zeitnehmer", "shotclock"] as const;
export type KampfgerichtRole = (typeof KAMPFGERICHT_ROLES)[number];

/**
 * One person a referee can reach about a team (#313).
 *
 * Deliberately not `TeamStaffMember`: a referee gets the name, the role and the
 * two ways to make contact, and never the portrait, the licence or the internal
 * ids the admin editor works with.
 */
export interface RefereeTeamContact {
  firstName: string;
  lastName: string;
  role: TeamStaffRole;
  phone: string | null;
  email: string | null;
}

/** The contacts of one Dragons team playing the game. */
export interface RefereeContactGroup {
  /** The team entry the contacts hang off — the dedupe key against `kampfgericht`. */
  teamEntryId: number;
  teamName: string;
  contacts: RefereeTeamContact[];
}

/**
 * One Kampfgericht line: the Dragons team named for one or more of the three
 * roles. All three roles collapse into a single entry when the same team runs
 * them, which is the normal case.
 */
export interface KampfgerichtEntry {
  /** In `KAMPFGERICHT_ROLES` order, never empty. */
  roles: KampfgerichtRole[];
  teamName: string;
  /**
   * The team's contacts, or `[]` when that team is the team playing — its
   * people are already under `contacts` and one person is listed once.
   */
  contacts: RefereeTeamContact[];
}

/**
 * A single referee game, as `GET /referee/games/:id` returns it.
 *
 * `kampfgericht` and `contacts` are present only for a caller who holds a slot
 * on the game or has assignment view permission (#313). For everyone else — a
 * referee looking at an open game they could claim — the keys are absent, not
 * empty: the phone number of a coach is not part of what an open fixture
 * advertises.
 */
export interface RefereeGameDetail extends RefereeGameListItem {
  brief: RefereeGameBrief;
  kampfgericht?: KampfgerichtEntry[];
  contacts?: RefereeContactGroup[];
}

/**
 * The game's page in the federation's portal SPA, keyed by the federation's own
 * `spielplanId` (stored as `apiMatchId`). Same `/static/#/<entity>/<id>` shape
 * as the league pages the public site links to.
 */
export function federationGameUrl(apiMatchId: number): string {
  return `https://www.basketball-bund.net/static/#/spiel/${String(apiMatchId)}`;
}
