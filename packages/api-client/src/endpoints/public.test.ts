import { describe, it, expect, vi } from "vitest";
import { publicEndpoints, type PublicTeam } from "./public";
import type { ApiClient } from "../client";

function mockClient() {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  } as unknown as ApiClient & {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
  };
}

describe("publicEndpoints", () => {
  describe("getMatches", () => {
    it("calls /public/matches with correct params", async () => {
      const client = mockClient();
      const endpoints = publicEndpoints(client);

      const params = { limit: 10, offset: 0, leagueId: 5 };
      await endpoints.getMatches(params);

      expect(client.get).toHaveBeenCalledWith("/public/matches", params, undefined);
    });

    it("works without params", async () => {
      const client = mockClient();
      const endpoints = publicEndpoints(client);

      await endpoints.getMatches();

      expect(client.get).toHaveBeenCalledWith(
        "/public/matches",
        undefined,
        undefined,
      );
    });

    it("forwards an abort signal so paging UIs can cancel a superseded request", async () => {
      const client = mockClient();
      const endpoints = publicEndpoints(client);
      const controller = new AbortController();

      await endpoints.getMatches({ limit: 1 }, { signal: controller.signal });

      expect(client.get).toHaveBeenCalledWith(
        "/public/matches",
        { limit: 1 },
        { signal: controller.signal },
      );
    });
  });

  describe("getStandings", () => {
    it("calls /public/standings", async () => {
      const client = mockClient();
      const endpoints = publicEndpoints(client);

      await endpoints.getStandings();

      expect(client.get).toHaveBeenCalledWith("/public/standings");
    });
  });

  describe("getTeams", () => {
    it("calls /public/teams", async () => {
      const client = mockClient();
      const endpoints = publicEndpoints(client);

      await endpoints.getTeams();

      expect(client.get).toHaveBeenCalledWith("/public/teams");
    });

    /**
     * `PublicTeam` is hand-written against the API's response (this package
     * cannot import apps/api), so it is pinned from both sides: the API asserts
     * its payload's key set in `team-list.service.test.ts`, and this fixture —
     * typed as `PublicTeam`, with no `as` to paper over a mismatch — fails to
     * compile if a field here is renamed, dropped or retyped.
     */
    it("types an own-club row, staff included, as the API returns it", async () => {
      const team: PublicTeam = {
        id: 10,
        apiTeamPermanentId: 160402,
        seasonTeamId: 1604020,
        teamCompetitionId: 99,
        name: "Dragons Herren 1",
        nameShort: "Dragons H1",
        customName: null,
        clubId: 1,
        isOwnClub: true,
        verzicht: false,
        dataHash: "abc",
        badgeColor: "red",
        estimatedGameDuration: 90,
        displayOrder: 1,
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
        staff: [
          {
            id: 1,
            personId: 4,
            firstName: "Emily",
            lastName: "Gust",
            role: "trainer",
            licence: "C-Lizenz",
            photoUrl: "/public/staff/1/photo?v=abc.webp",
          },
        ],
      };

      const client = mockClient();
      client.get.mockResolvedValue([team]);

      expect(await publicEndpoints(client).getTeams()).toEqual([team]);
    });

    it("types a non-own-club row, which carries no staff key", () => {
      const rival: PublicTeam = {
        id: 11,
        apiTeamPermanentId: 999,
        seasonTeamId: 9990,
        teamCompetitionId: 1,
        name: "Rivals",
        nameShort: null,
        customName: null,
        clubId: 2,
        isOwnClub: false,
        verzicht: null,
        dataHash: null,
        badgeColor: null,
        estimatedGameDuration: null,
        displayOrder: 0,
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      };

      expect(rival.staff).toBeUndefined();
    });
  });

  describe("getMatch", () => {
    it("calls /public/matches/:id", async () => {
      const client = mockClient();
      const endpoints = publicEndpoints(client);

      await endpoints.getMatch(1);

      expect(client.get).toHaveBeenCalledWith("/public/matches/1");
    });
  });

  describe("getMatchContext", () => {
    it("calls /public/matches/:id/context", async () => {
      const client = mockClient();
      const endpoints = publicEndpoints(client);

      await endpoints.getMatchContext(1);

      expect(client.get).toHaveBeenCalledWith("/public/matches/1/context");
    });
  });

  describe("getTeamStats", () => {
    it("calls /public/teams/:id/stats", async () => {
      const client = mockClient();
      const endpoints = publicEndpoints(client);

      await endpoints.getTeamStats(1);

      expect(client.get).toHaveBeenCalledWith("/public/teams/1/stats");
    });
  });

  describe("getHomeDashboard", () => {
    it("calls /public/home/dashboard", async () => {
      const client = mockClient();
      const endpoints = publicEndpoints(client);

      await endpoints.getHomeDashboard();

      expect(client.get).toHaveBeenCalledWith("/public/home/dashboard");
    });
  });
});
