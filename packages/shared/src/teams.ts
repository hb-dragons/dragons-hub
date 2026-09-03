export interface OwnClubTeam {
  /** Team entry id (per season) — the id PATCH /admin/teams/:id addresses. */
  id: number;
  /** Squad id (teams.id), stable across seasons. */
  teamId: number;
  name: string;
  nameShort: string | null;
  customName: string | null;
  leagueId: number | null;
  leagueName: string | null;
  /** False when the connected league is no longer tracked — UI shows a warning. */
  leagueTracked: boolean;
  linkSource: "seeded" | "manual";
  estimatedGameDuration: number | null;
  badgeColor: string | null;
  displayOrder: number;
}

export interface TeamReorderItem {
  id: number;
  name: string;
  displayOrder: number;
}

/** The roles a Team staff member can hold. Widen when Betreuer/Teammanager arrive (ADR 0008). */
export const TEAM_STAFF_ROLES = ["trainer", "co_trainer"] as const;
export type TeamStaffRole = (typeof TEAM_STAFF_ROLES)[number];

/** One staff member of a team entry, as the admin endpoints return them. */
export interface TeamStaffMember {
  id: number;
  teamEntryId: number;
  firstName: string;
  lastName: string;
  role: TeamStaffRole;
  phone: string | null;
  email: string | null;
  licence: string | null;
  /**
   * API path of the portrait, or `null` when the member has none. Relative to
   * the API base so each caller prefixes its own origin, and stamped with the
   * stored object name so replacing a portrait busts the cache the image route
   * sets on the previous one.
   */
  photoUrl: string | null;
  /** Marks the member referees are pointed at as the team contact. */
  refereeContact: boolean;
}
