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
  sr1Status: "open" | "offered" | "assigned";
  sr2Status: "open" | "offered" | "assigned";
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
