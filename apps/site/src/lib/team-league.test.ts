import { describe, expect, it } from "vitest";

import { fetchTeamLeagueNames, leagueNameFor } from "./team-league";

const STANDINGS = [
  {
    leagueId: 2,
    leagueName: "Landesliga Herren 2",
    seasonName: "",
    standings: [{ teamApiId: 160402 }, { teamApiId: 158917 }],
  },
  {
    leagueId: 1,
    leagueName: "Oberliga Damen Ost",
    seasonName: "",
    standings: [{ teamApiId: 320674 }],
  },
];

function fetchReturning(status: number, body: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
}

describe("fetchTeamLeagueNames", () => {
  it("maps every standings row's teamApiId to its league name", async () => {
    let requested = "";
    const fetchImpl = (async (input: string | URL | Request) => {
      requested = String(input);
      return new Response(JSON.stringify(STANDINGS), { status: 200 });
    }) as typeof fetch;
    const names = await fetchTeamLeagueNames("https://api.example", fetchImpl);
    expect(requested).toBe("https://api.example/public/standings");
    expect(names.get(160402)).toBe("Landesliga Herren 2");
    expect(names.get(158917)).toBe("Landesliga Herren 2");
    expect(names.get(320674)).toBe("Oberliga Damen Ost");
    expect(names.get(999999)).toBeUndefined();
  });

  it("tolerates a trailing slash on the base URL", async () => {
    let requested = "";
    const fetchImpl = (async (input: string | URL | Request) => {
      requested = String(input);
      return new Response(JSON.stringify([]), { status: 200 });
    }) as typeof fetch;
    await fetchTeamLeagueNames("https://api.example/", fetchImpl);
    expect(requested).toBe("https://api.example/public/standings");
  });

  it("throws on a non-200 response", async () => {
    await expect(
      fetchTeamLeagueNames("https://api.example", fetchReturning(503, [])),
    ).rejects.toThrow(/HTTP 503/);
  });

  it("throws on an unexpected response shape", async () => {
    await expect(
      fetchTeamLeagueNames("https://api.example", fetchReturning(200, { nope: true })),
    ).rejects.toThrow();
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
