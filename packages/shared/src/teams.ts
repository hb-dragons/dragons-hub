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
