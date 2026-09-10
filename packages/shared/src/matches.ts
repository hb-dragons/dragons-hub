import type { BookingStatus, DiffStatus } from "./constants";
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
  booking: {
    id: number;
    status: BookingStatus;
    needsReconfirmation: boolean;
  } | null;
}

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
 * One weekend day a game to be rescheduled could move to. In this slice a
 * candidate carries nothing but the day itself: hall bookings, flags and
 * suggested kickoffs arrive with the later slices of the finder.
 */
export interface AlternativeDateCandidate {
  /** `YYYY-MM-DD` in the club's timezone. */
  date: string;
  weekday: "saturday" | "sunday";
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
  candidates: AlternativeDateCandidate[];
}
