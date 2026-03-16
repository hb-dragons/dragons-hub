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

export interface RefereeMatchListItem {
  id: number;
  apiMatchId: number;
  matchNo: number;
  kickoffDate: string;
  kickoffTime: string;
  homeTeamName: string;
  guestTeamName: string;
  homeIsOwnClub: boolean;
  guestIsOwnClub: boolean;
  leagueName: string | null;
  venueName: string | null;
  venueCity: string | null;
  sr1Open: boolean;
  sr2Open: boolean;
  isForfeited: boolean;
  isCancelled: boolean;
  ownClubRefs: boolean;
  sr1Referee: { firstName: string | null; lastName: string | null } | null;
  sr2Referee: { firstName: string | null; lastName: string | null } | null;
  sr1Allowed: boolean;
  sr2Allowed: boolean;
  currentRefereeId: number | null;
  intents: {
    slotNumber: number;
    refereeId: number;
    refereeFirstName: string | null;
    refereeLastName: string | null;
    clickedAt: string;
    confirmedBySyncAt: string | null;
  }[];
}

export interface TakeMatchResponse {
  deepLink: string;
  intent: {
    matchId: number;
    slotNumber: number;
    clickedAt: string;
  };
}

export interface VerifyMatchResponse {
  confirmed: boolean;
  sr1Open: boolean;
  sr2Open: boolean;
  sr1Referee: { firstName: string | null; lastName: string | null } | null;
  sr2Referee: { firstName: string | null; lastName: string | null } | null;
}
