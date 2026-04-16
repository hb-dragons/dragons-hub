export interface RefereeListItem {
  id: number;
  apiId: number;
  firstName: string | null;
  lastName: string | null;
  licenseNumber: number | null;
  matchCount: number;
  roles: string[];
  allowAllHomeGames: boolean;
  allowAwayGames: boolean;
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

export interface UpdateRefereeVisibilityBody {
  allowAllHomeGames: boolean;
  allowAwayGames: boolean;
}

export interface UpdateRefereeRulesBody {
  rules: Array<{
    teamId: number;
    deny: boolean;
    allowSr1: boolean;
    allowSr2: boolean;
  }>;
}
