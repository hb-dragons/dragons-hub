export interface PublicTeam {
  apiTeamPermanentId: number;
  name: string;
  nameShort: string | null;
  customName: string | null;
  badgeColor: string | null;
}

/** Resolve display name: customName > nameShort > name */
export function resolveTeamName(team: { customName?: string | null; nameShort?: string | null; name: string }): string {
  return team.customName ?? team.nameShort ?? team.name;
}
