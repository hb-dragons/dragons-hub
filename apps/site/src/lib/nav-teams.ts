/**
 * Groups teams into the three rows of the NavBar teams dropdown.
 *
 * 1:1 port of dragons-app TeamsNavLinks (components/teams/NavLinks.vue):
 * substring matches on the name, a team may appear in several rows (e.g.
 * "Herren U20" is both `herren` and `jugend`), unmatched teams appear in none.
 */
export interface NavTeamGroups<T> {
  damen: T[];
  herren: T[];
  jugend: T[];
}

export function groupTeamsForNav<T extends { name: string }>(teams: T[]): NavTeamGroups<T> {
  const groups: NavTeamGroups<T> = { damen: [], herren: [], jugend: [] };
  for (const team of teams) {
    if (team.name.includes("Damen")) groups.damen.push(team);
    if (team.name.includes("Herren")) groups.herren.push(team);
    if (team.name.toLowerCase().includes("u")) groups.jugend.push(team);
  }
  return groups;
}
