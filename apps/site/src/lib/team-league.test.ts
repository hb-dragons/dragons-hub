import { describe, expect, it } from "vitest";

import { fetchStandingsLeagues, leagueNameFor, teamLeagueNames } from "./team-league";

function standingRow(overrides: Record<string, unknown> = {}) {
  return {
    position: 1,
    teamApiId: 160402,
    teamName: "HB Dragons",
    played: 10,
    won: 8,
    lost: 2,
    leaguePoints: 16,
    pointsFor: 720,
    pointsAgainst: 610,
    verzicht: false,
    ...overrides,
  };
}

const STANDINGS = [
  {
    leagueId: 2,
    leagueName: "Landesliga Herren 2",
    seasonName: "",
    standings: [standingRow(), standingRow({ teamApiId: 158917, position: 2 })],
  },
  {
    leagueId: 1,
    leagueName: "Oberliga Damen Ost",
    seasonName: "",
    standings: [standingRow({ teamApiId: 320674 })],
  },
];

function fetchReturning(status: number, body: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
}

describe("fetchStandingsLeagues", () => {
  it("fetches every league with the rows the team pages render", async () => {
    let requested = "";
    const fetchImpl = (async (input: string | URL | Request) => {
      requested = String(input);
      return new Response(JSON.stringify(STANDINGS), { status: 200 });
    }) as typeof fetch;
    const leagues = await fetchStandingsLeagues("https://api.example", fetchImpl);
    expect(requested).toBe("https://api.example/public/standings");
    expect(leagues).toHaveLength(2);
    expect(leagues[0]?.leagueName).toBe("Landesliga Herren 2");
    expect(leagues[0]?.standings[0]).toMatchObject({
      teamApiId: 160402,
      teamName: "HB Dragons",
      position: 1,
      leaguePoints: 16,
    });
  });

  it("tolerates a missing verzicht flag (live API may lag a deploy)", async () => {
    const body = [{ ...STANDINGS[1], standings: [standingRow({ verzicht: undefined })] }];
    const leagues = await fetchStandingsLeagues("https://api.example", fetchReturning(200, body));
    expect(leagues[0]?.standings[0]?.verzicht).toBeUndefined();
  });

  it("tolerates a trailing slash on the base URL", async () => {
    let requested = "";
    const fetchImpl = (async (input: string | URL | Request) => {
      requested = String(input);
      return new Response(JSON.stringify([]), { status: 200 });
    }) as typeof fetch;
    await fetchStandingsLeagues("https://api.example/", fetchImpl);
    expect(requested).toBe("https://api.example/public/standings");
  });

  it("throws on a non-200 response", async () => {
    await expect(
      fetchStandingsLeagues("https://api.example", fetchReturning(503, [])),
    ).rejects.toThrow(/HTTP 503/);
  });

  it("throws on an unexpected response shape", async () => {
    await expect(
      fetchStandingsLeagues("https://api.example", fetchReturning(200, { nope: true })),
    ).rejects.toThrow();
  });
});

describe("teamLeagueNames", () => {
  it("maps every standings row's teamApiId to its league name", async () => {
    const leagues = await fetchStandingsLeagues(
      "https://api.example",
      fetchReturning(200, STANDINGS),
    );
    const names = teamLeagueNames(leagues);
    expect(names.get(160402)).toBe("Landesliga Herren 2");
    expect(names.get(158917)).toBe("Landesliga Herren 2");
    expect(names.get(320674)).toBe("Oberliga Damen Ost");
    expect(names.get(999999)).toBeUndefined();
  });
});

describe("leagueNameFor", () => {
  const names = new Map([[160402, "Landesliga Herren 2"]]);

  it("resolves a team's league name by its api id", () => {
    expect(leagueNameFor(names, 160402)).toBe("Landesliga Herren 2");
  });

  it("returns null for an unknown team", () => {
    expect(leagueNameFor(names, 999999)).toBeNull();
  });

  it("returns null when the team has no api id", () => {
    expect(leagueNameFor(names, null)).toBeNull();
    expect(leagueNameFor(names, undefined)).toBeNull();
  });
});
