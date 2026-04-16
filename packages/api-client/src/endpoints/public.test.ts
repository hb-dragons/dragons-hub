import { describe, it, expect, vi } from "vitest";
import { publicEndpoints } from "./public.js";
import type { ApiClient } from "../client.js";

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
});
