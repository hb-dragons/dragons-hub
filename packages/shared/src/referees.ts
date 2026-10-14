import type { RefereeGameListItem } from "./referee-games";

export interface RefereeListItem {
  id: number;
  apiId: number;
  firstName: string | null;
  lastName: string | null;
  licenseNumber: number | null;
  matchCount: number;
  allowAllHomeGames: boolean;
  allowAwayGames: boolean;
  isOwnClub: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RefereeRule {
  id: number;
  teamId: number;
  teamName: string;
  deny: boolean;
  allowSr1: boolean;
  allowSr2: boolean;
}

export interface RefereeRulesResponse {
  rules: RefereeRule[];
}

// Request body types live in `@dragons/contracts`: `RefereeVisibilityBody`
// (referee.ts) and `UpdateRefereeRulesBodyParsed` (referee-rules.ts).

export interface RefereeCountsResponse {
  own: number;
  all: number;
}

/** A league that has at least one referee game the admin open-games list can show. */
export interface RefereeGameLeague {
  /** Federation league id — the value the `league` filter on `/referee/games` takes. */
  apiLigaId: number;
  name: string;
  short: string | null;
}

export interface RefereeGameLeaguesResponse {
  leagues: RefereeGameLeague[];
}

export interface EligibleOpenGamesResponse {
  items: RefereeGameListItem[];
}
