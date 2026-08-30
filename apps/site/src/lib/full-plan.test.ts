import { describe, expect, it } from "vitest";

import { fetchBuildPlan, prevNextGames, teamGames } from "./full-plan";

/** A match as `/public/matches` serves it — PlanGame fields plus API extras. */
function planGame(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    matchNo: 101,
    kickoffDate: "2026-09-05",
    kickoffTime: "18:00:00",
    homeTeamApiId: 322001,
    guestTeamApiId: 411002,
    homeTeamName: "Hanover Basketball Dragons",
    guestTeamName: "CVJM Hannover 2",
    homeTeamCustomName: "Herren 1",
    guestTeamCustomName: null,
    homeIsOwnClub: true,
    guestIsOwnClub: false,
    homeClubId: 4121,
    guestClubId: 4213,
    homeBadgeColor: "rose",
    guestBadgeColor: null,
    leagueName: "Bezirksliga Herren",
    venueName: "Goetheschule",
    venueStreet: "Bunsenstraße 6",
    venuePostalCode: "30165",
    venueCity: "Hannover",
    venueNameOverride: null,
    homeScore: null,
    guestScore: null,
    publicComment: null,
    ...overrides,
  };
}

function pageBody(items: unknown[], hasMore = false) {
  return { items, hasMore };
}

function fetchReturning(status: number, body: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
}

describe("fetchBuildPlan", () => {
  it("crawls /public/matches pages into the full plan", async () => {
    const requested: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      requested.push(String(input));
      const offset = Number(url.searchParams.get("offset"));
      const body =
        offset === 0
          ? pageBody([planGame(), planGame({ id: 2 })], true)
          : pageBody([planGame({ id: 3 })]);
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;

    const plan = await fetchBuildPlan("https://api.example", fetchImpl);

    expect(plan.map((game) => game.id)).toEqual([1, 2, 3]);
    expect(requested[0]).toContain("https://api.example/public/matches?");
    expect(requested[0]).toContain("sort=asc");
    expect(requested[1]).toContain("offset=2");
  });

  it("drops fields the pages do not render", async () => {
    const fetchImpl = fetchReturning(200, pageBody([planGame({ anschreiber: "someone" })]));
    const plan = await fetchBuildPlan("https://api.example", fetchImpl);
    expect(plan[0]).not.toHaveProperty("anschreiber");
    // The Excel export slice survives the strip.
    expect(plan[0]).toMatchObject({
      matchNo: 101,
      leagueName: "Bezirksliga Herren",
      publicComment: null,
      homeTeamApiId: 322001,
      guestTeamApiId: 411002,
    });
  });

  it("throws on a non-200 response", async () => {
    await expect(fetchBuildPlan("https://api.example", fetchReturning(503, {}))).rejects.toThrow(
      /HTTP 503/,
    );
  });

  it("throws when a match drifts in shape", async () => {
    await expect(
      fetchBuildPlan(
        "https://api.example",
        fetchReturning(200, pageBody([planGame({ kickoffDate: 5 })])),
      ),
    ).rejects.toThrow();
  });
});

describe("teamGames", () => {
  const plan = [
    planGame({ id: 1, homeTeamApiId: 322001, guestTeamApiId: 411002 }),
    planGame({ id: 2, homeTeamApiId: 411003, guestTeamApiId: 322001 }),
    planGame({ id: 3, homeTeamApiId: 322002, guestTeamApiId: 411004 }),
  ];

  it("keeps games where either side is the team", async () => {
    const fetchImpl = fetchReturning(200, pageBody(plan));
    const full = await fetchBuildPlan("https://api.example", fetchImpl);
    expect(teamGames(full, 322001).map((game) => game.id)).toEqual([1, 2]);
  });

  it("is empty without a join key", async () => {
    const fetchImpl = fetchReturning(200, pageBody(plan));
    const full = await fetchBuildPlan("https://api.example", fetchImpl);
    expect(teamGames(full, null)).toEqual([]);
  });
});

describe("prevNextGames", () => {
  const scored = { homeScore: 72, guestScore: 46 };

  function buildPlan(games: Record<string, unknown>[]) {
    return fetchBuildPlan("https://api.example", fetchReturning(200, pageBody(games)));
  }

  it("picks the latest scored game before today and the first game from today on", async () => {
    const plan = await buildPlan([
      planGame({ id: 1, kickoffDate: "2026-08-20", ...scored }),
      planGame({ id: 2, kickoffDate: "2026-08-27", ...scored }),
      planGame({ id: 3, kickoffDate: "2026-09-05" }),
      planGame({ id: 4, kickoffDate: "2026-09-12" }),
    ]);
    const { prev, next } = prevNextGames(plan, "2026-08-30");
    expect(prev?.id).toBe(2);
    expect(next?.id).toBe(3);
  });

  it("skips unscored past games for the previous slot (hasScore semantics)", async () => {
    const plan = await buildPlan([
      planGame({ id: 1, kickoffDate: "2026-08-20", ...scored }),
      planGame({ id: 2, kickoffDate: "2026-08-27" }),
    ]);
    const { prev } = prevNextGames(plan, "2026-08-30");
    expect(prev?.id).toBe(1);
  });

  it("includes today on both sides, like dateFrom/dateTo", async () => {
    const plan = await buildPlan([
      planGame({ id: 1, kickoffDate: "2026-08-30", ...scored }),
    ]);
    const { prev, next } = prevNextGames(plan, "2026-08-30");
    expect(prev?.id).toBe(1);
    expect(next?.id).toBe(1);
  });

  it("breaks same-day ties by kickoff time", async () => {
    const plan = await buildPlan([
      planGame({ id: 1, kickoffDate: "2026-08-27", kickoffTime: "12:00:00", ...scored }),
      planGame({ id: 2, kickoffDate: "2026-08-27", kickoffTime: "16:00:00", ...scored }),
      planGame({ id: 3, kickoffDate: "2026-09-05", kickoffTime: "16:00:00" }),
      planGame({ id: 4, kickoffDate: "2026-09-05", kickoffTime: "12:00:00" }),
    ]);
    const { prev, next } = prevNextGames(plan, "2026-08-30");
    expect(prev?.id).toBe(2);
    expect(next?.id).toBe(4);
  });

  it("returns nulls for an empty plan", () => {
    expect(prevNextGames([], "2026-08-30")).toEqual({ prev: null, next: null });
  });
});
