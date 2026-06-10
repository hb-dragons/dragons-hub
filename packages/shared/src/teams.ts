export interface OwnClubTeam {
  id: number;
  name: string;
  nameShort: string | null;
  customName: string | null;
  leagueName: string | null;
  estimatedGameDuration: number | null;
  badgeColor: string | null;
  displayOrder: number;
}

export interface TeamReorderItem {
  id: number;
  name: string;
  displayOrder: number;
}
