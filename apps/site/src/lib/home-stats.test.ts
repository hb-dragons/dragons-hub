import { describe, expect, it } from "vitest";

import { fetchHomeDashboard, yearsSinceFounding } from "./home-stats";

describe("yearsSinceFounding", () => {
  it("computes full calendar years since the founding year", () => {
    expect(yearsSinceFounding(2011, new Date("2026-08-02"))).toBe(15);
  });

  it("is zero in the founding year itself", () => {
    expect(yearsSinceFounding(2026, new Date("2026-01-01"))).toBe(0);
  });
});

/** A dashboard game as `/public/home/dashboard` serves it, GameLite fields only. */
function dashboardGame(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    kickoffDate: "2026-09-05",
    kickoffTime: "18:00:00",
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
    venueName: "Goetheschule",
    venueStreet: "Bunsenstraße 6",
    venuePostalCode: "30165",
    venueCity: "Hannover",
    venueNameOverride: null,
    homeScore: null,
    guestScore: null,
    ...overrides,
  };
}

function dashboardBody(overrides: Record<string, unknown> = {}) {
  return {
    clubStats: { teamCount: 9 },
    upcomingGames: [dashboardGame()],
    ...overrides,
  };
}

function fetchReturning(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status })) as typeof fetch;
}

describe("fetchHomeDashboard", () => {
  it("reads teamCount and upcomingGames from /public/home/dashboard", async () => {
    let requested = "";
    const fetchImpl = (async (input: string | URL | Request) => {
      requested = String(input);
      return new Response(JSON.stringify(dashboardBody()), { status: 200 });
    }) as typeof fetch;
    const dashboard = await fetchHomeDashboard("https://api.example", fetchImpl);
    expect(requested).toBe("https://api.example/public/home/dashboard");
    expect(dashboard.teamCount).toBe(9);
    expect(dashboard.upcomingGames).toHaveLength(1);
    expect(dashboard.upcomingGames[0]).toMatchObject({
      id: 1,
      venueName: "Goetheschule",
      homeTeamCustomName: "Herren 1",
      // The GameCard slice: badge colors and the maps-link address fields.
      homeBadgeColor: "rose",
      guestBadgeColor: null,
      venueStreet: "Bunsenstraße 6",
      venuePostalCode: "30165",
      venueCity: "Hannover",
    });
  });

  it("drops dashboard fields the home page does not render", async () => {
    const fetchImpl = fetchReturning(
      200,
      dashboardBody({ upcomingGames: [dashboardGame({ anschreiber: "someone" })] }),
    );
    const dashboard = await fetchHomeDashboard("https://api.example", fetchImpl);
    expect(dashboard.upcomingGames[0]).not.toHaveProperty("anschreiber");
  });

  it("tolerates a trailing slash on the base URL", async () => {
    let requested = "";
    const fetchImpl = (async (input: string | URL | Request) => {
      requested = String(input);
      return new Response(JSON.stringify(dashboardBody()), { status: 200 });
    }) as typeof fetch;
    await fetchHomeDashboard("https://api.example/", fetchImpl);
    expect(requested).toBe("https://api.example/public/home/dashboard");
  });

  it("throws on a non-200 response", async () => {
    await expect(
      fetchHomeDashboard("https://api.example", fetchReturning(503, {})),
    ).rejects.toThrow(/HTTP 503/);
  });

  it("throws when clubStats drifts in shape", async () => {
    await expect(
      fetchHomeDashboard(
        "https://api.example",
        fetchReturning(200, dashboardBody({ clubStats: {} })),
      ),
    ).rejects.toThrow();
  });

  it("throws when a game drifts in shape", async () => {
    await expect(
      fetchHomeDashboard(
        "https://api.example",
        fetchReturning(200, dashboardBody({ upcomingGames: [dashboardGame({ kickoffDate: 5 })] })),
      ),
    ).rejects.toThrow();
  });
});
