import { describe, expect, it } from "vitest";

import { groupTeamsForNav } from "./nav-teams";

const team = (name: string) => ({ name });

describe("groupTeamsForNav", () => {
  // Grouping rules are a 1:1 port of dragons-app TeamsNavLinks
  // (components/teams/NavLinks.vue): substring matches, a team may land in
  // several rows, unmatched teams land in none.
  it("groups Damen, Herren and youth teams into their rows", () => {
    const damen1 = team("Damen 1");
    const herren1 = team("Herren 1");
    const herren2 = team("Herren 2");
    const u18 = team("U18");
    const groups = groupTeamsForNav([damen1, herren1, herren2, u18]);
    expect(groups.damen).toEqual([damen1]);
    expect(groups.herren).toEqual([herren1, herren2]);
    expect(groups.jugend).toEqual([u18]);
  });

  it("matches youth teams case-insensitively on 'u'", () => {
    const u12 = team("u12");
    expect(groupTeamsForNav([u12]).jugend).toEqual([u12]);
  });

  it("keeps the incoming order inside each row", () => {
    const first = team("U10");
    const second = team("U14");
    expect(groupTeamsForNav([first, second]).jugend).toEqual([first, second]);
  });

  it("leaves teams matching no rule out of all rows", () => {
    const groups = groupTeamsForNav([team("Mixed 1")]);
    expect(groups.damen).toEqual([]);
    expect(groups.herren).toEqual([]);
    expect(groups.jugend).toEqual([]);
  });
});
