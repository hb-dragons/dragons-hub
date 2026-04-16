import { describe, it, expect, vi } from "vitest";
import { publicEndpoints } from "./public";
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

      expect(client.get).toHaveBeenCalledWith("/public/matches", params);
    });

    it("works without params", async () => {
      const client = mockClient();
      const endpoints = publicEndpoints(client);

      await endpoints.getMatches();

      expect(client.get).toHaveBeenCalledWith(
        "/public/matches",
        undefined,
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
