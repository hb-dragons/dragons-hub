import type { BookingStatus, DiffStatus } from "./constants";
export interface RefereeSlotInfo {
  slotNumber: number;
  isOpen: boolean;
  referee: {
    id: number;
    firstName: string | null;
    lastName: string | null;
  } | null;
  role: {
    id: number;
    name: string;
    shortName: string | null;
  } | null;
  intent: {
    refereeId: number;
    refereeFirstName: string | null;
    refereeLastName: string | null;
    clickedAt: string;
    confirmedBySyncAt: string | null;
  } | null;
}

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
  guestTeamApiId: number;
  guestTeamName: string;
  guestTeamNameShort: string | null;
  guestTeamCustomName: string | null;
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
  isConfirmed: boolean | null;
  isForfeited: boolean | null;
  isCancelled: boolean | null;
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
