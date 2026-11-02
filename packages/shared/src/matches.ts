import type { DiffStatus } from "./constants";
import type { HallCoverageInfo, HallTimeWindow } from "./hall-times";
import type { HallOccupancyGame } from "./hall-occupancy";
import type { ClubWeekendDay } from "./kickoff";
interface RefereeSlotReferee {
  id: number;
  firstName: string | null;
  lastName: string | null;
}

interface RefereeSlotRole {
  id: number;
  name: string;
  shortName: string | null;
}

interface RefereeSlotIntent {
  refereeId: number;
  refereeFirstName: string | null;
  refereeLastName: string | null;
  clickedAt: string;
  confirmedBySyncAt: string | null;
}

interface RefereeSlotBase {
  slotNumber: number;
  intent: RefereeSlotIntent | null;
}

/**
 * A slot is either open or filled — never both (issue #105). Encoding that as a
 * union rather than as three independent fields means a caller physically
 * cannot build `{ isOpen: true, referee: {...} }`, so the contradiction cannot
 * reappear at some other call site.
 */
export type RefereeSlotInfo =
  | (RefereeSlotBase & { isOpen: true; referee: null; role: null })
  | (RefereeSlotBase & {
      isOpen: false;
      referee: RefereeSlotReferee | null;
      role: RefereeSlotRole | null;
    });

export interface FieldDiff {
  field: string;
  label: string;
  remoteValue: string | null;
  localValue: string | null;
  status: DiffStatus;
}

export interface OverrideInfo {
  fieldName: string;
  reason: string | null;
  changedBy: string | null;
  createdAt: string;
}

export interface MatchListItem {
  id: number;
  apiMatchId: number;
  matchNo: number;
  matchDay: number;
  kickoffDate: string;
  kickoffTime: string;
  homeTeamApiId: number;
  homeTeamName: string;
  homeTeamNameShort: string | null;
  homeTeamCustomName: string | null;
  homeClubId: number;
  guestTeamApiId: number;
  guestTeamName: string;
  guestTeamNameShort: string | null;
  guestTeamCustomName: string | null;
  guestClubId: number;
  homeIsOwnClub: boolean;
  guestIsOwnClub: boolean;
  homeBadgeColor: string | null;
  guestBadgeColor: string | null;
  homeScore: number | null;
  guestScore: number | null;
  leagueId: number | null;
  leagueName: string | null;
  venueId: number | null;
  venueName: string | null;
  venueStreet: string | null;
  venuePostalCode: string | null;
  venueCity: string | null;
  venueNameOverride: string | null;
  // NOT NULL in `matches` (migration 0042) — no `?? false` needed downstream.
  isConfirmed: boolean;
  isForfeited: boolean;
  isCancelled: boolean;
  anschreiber: string | null;
  zeitnehmer: string | null;
  shotclock: string | null;
  publicComment: string | null;
  hasLocalChanges: boolean;
  overriddenFields: string[];
  /** The day's hall time against the window its games need; null for away games and games not at one of our halls. */
  hallCoverage: MatchHallCoverage | null;
}

/** Hall coverage of the day a game sits on, with the window and game count behind it. */
export interface MatchHallCoverage extends HallCoverageInfo {
  windowStart: string;
  windowEnd: string;
  /** Live home games at that hall that day, this one included. */
  gameCount: number;
}

/** A real game on the admin game plan. */
export interface GamePlanMatchItem extends MatchListItem {
  kind: "match";
}

/**
 * Ghost entry (see CONTEXT.md): a read-only row on the official kickoff day of
 * a game whose kickoff date override moved it to another day. `id` is the real
 * game's id, and `kickoffDate`/`kickoffTime` hold the official kickoff (the
 * federation's current value) so the row sorts and filters by the day it
 * stands on. The effective kickoff is where the real row sits.
 */
export interface GamePlanGhostItem extends MatchListItem {
  kind: "ghost";
  effectiveKickoffDate: string;
  effectiveKickoffTime: string;
  /** Reason recorded on the kickoff date override; null when none was given. */
  overrideReason: string | null;
  /** Name of the account that set the override; null when it is unknown. */
  overrideAuthorName: string | null;
}

export type GamePlanItem = GamePlanMatchItem | GamePlanGhostItem;

export interface MatchDetail extends MatchListItem {
  homeHalftimeScore: number | null;
  guestHalftimeScore: number | null;
  periodFormat: string | null;
  homeQ1: number | null;
  guestQ1: number | null;
  homeQ2: number | null;
  guestQ2: number | null;
  homeQ3: number | null;
  guestQ3: number | null;
  homeQ4: number | null;
  guestQ4: number | null;
  homeQ5: number | null;
  guestQ5: number | null;
  homeQ6: number | null;
  guestQ6: number | null;
  homeQ7: number | null;
  guestQ7: number | null;
  homeQ8: number | null;
  guestQ8: number | null;
  homeOt1: number | null;
  guestOt1: number | null;
  homeOt2: number | null;
  guestOt2: number | null;
  internalNotes: string | null;
  createdAt: string;
  updatedAt: string;
  overrides: OverrideInfo[];
  refereeSlots?: RefereeSlotInfo[];
}

export interface MatchDetailResponse {
  match: MatchDetail;
  diffs: FieldDiff[];
}

export interface MatchFieldChange {
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
}

export interface MatchChangesResponse {
  changes: MatchFieldChange[];
}

export interface MatchChangeHistoryItem {
  id: number;
  track: "remote" | "local";
  versionNumber: number;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string | null;
  createdAt: string;
}

export interface MatchChangeHistoryResponse {
  changes: MatchChangeHistoryItem[];
  total: number;
}

/** An inclusive span of club calendar days, both ends `YYYY-MM-DD`. */
export interface DateRange {
  from: string;
  to: string;
}

/**
 * Which pile a candidate belongs in, and therefore what the panel shows for it.
 * A home game day is judged by the best of our halls that day:
 *
 * - `fits`: the game fits into a hall time the club holds;
 * - `heldNoFit`: a hall time is held somewhere, but the game does not fit in
 *   it — the hall time would have to grow or games would have to move;
 * - `notHeld`: no hall time is held — our halls have no row or are closed, in
 *   any mix;
 * - `closed`: every one of our halls is closed that day.
 *
 * An away game has one pile, because the hall is the other club's problem.
 */
export type AlternativeDateGroup = "fits" | "heldNoFit" | "notHeld" | "closed" | "away";

/**
 * One of our halls on a candidate day: its hall time, the home games already
 * played there (without the game being moved), and whether the moved game
 * fits in next to them.
 */
export interface AlternativeDateHall {
  venueId: number;
  venueName: string;
  /** The hall the game is played in today. */
  isCurrentVenue: boolean;
  /** The hall time the club holds that day, or null when it holds none. */
  hallTime: HallTimeWindow | null;
  /** Live home games already there that day, in kickoff order. */
  games: HallOccupancyGame[];
  /** How the hall time covers the games already there; null when there are none. */
  existing: HallCoverageInfo | null;
  /** Whether the moved game can be placed inside the hall time next to those games. */
  fits: boolean;
  /** `HH:mm:ss`, rounded to the quarter hour (up after a game or hall start, down before the first game); null when the game does not fit. */
  suggestedKickoffTime: string | null;
}

/**
 * Why a candidate day deserves a second look. A flag informs, it never
 * excludes: the federation may question a date outside the round window and a
 * coach may be standing on another court that day, but whether either matters
 * is the staff member's call, not the finder's (ADR-0010).
 *
 * A discriminated union rather than a code plus optional fields, so the team
 * entry name exists exactly where it means something.
 */
export type AlternativeDateFlag =
  /** Outside the min/max kickoff date of the same match day across the league. */
  | { type: "outsideRoundWindow" }
  /**
   * Someone on the moving team entry also works with another team entry that
   * plays that day. `teamEntryName` is that other entry, named as it is on
   * screen.
   */
  | { type: "coachCollision"; teamEntryName: string };

/**
 * One weekend day a game to be rescheduled could move to: the day, which pile
 * it belongs in, what the hall looks like that day, and what the finder has to
 * say about it without refusing it.
 */
export interface AlternativeDateCandidate {
  /** `YYYY-MM-DD` in the club's timezone. */
  date: string;
  weekday: ClubWeekendDay;
  group: AlternativeDateGroup;
  /**
   * Every one of our halls that day: the game's current hall first (when it
   * is one of ours), then by name. Empty for an away game.
   */
  halls: AlternativeDateHall[];
  /** Empty when nothing about the day needs saying — the common case. */
  flags: AlternativeDateFlag[];
}

/**
 * Why the candidate list may be incomplete. A code rather than prose: the
 * caveat is shown to a staff member in their own locale, so the wording lives
 * in the web app's messages, not in the API response.
 */
export type AlternativeDatesCaveat = "opponentGamesOutsideTrackedLeagues";

export interface AlternativeDatesResponse {
  /** Whether the home squad belongs to the club — who owes the hall. */
  isHomeGame: boolean;
  caveats: AlternativeDatesCaveat[];
  /**
   * The range the candidates were enumerated over, after the server filled in
   * whatever the client left out. The date pickers show this back.
   */
  range: DateRange;
  /** Ranked server-side: by group, then unflagged before flagged, then chronological. */
  candidates: AlternativeDateCandidate[];
}
