import { describe, it, expect, vi } from "vitest";
import { ApiClient } from "../client";
import { refereeAdminEndpoints } from "./referee-admin";

describe("refereeAdminEndpoints.eligibleOpenGames", () => {
  it("GETs /admin/referees/:id/eligible-open-games", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = new ApiClient({
      baseUrl: "https://example.test",
      fetchFn: mockFetch as unknown as typeof fetch,
    });
    const api = refereeAdminEndpoints(client);

    const result = await api.eligibleOpenGames(42);

    expect(mockFetch).toHaveBeenCalledOnce();
    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toBe("https://example.test/admin/referees/42/eligible-open-games");
    expect(result.items).toEqual([]);
  });
});

describe("refereeAdminEndpoints.gameLeagues", () => {
  it("GETs /admin/referees/game-leagues", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ leagues: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = new ApiClient({
      baseUrl: "https://example.test",
      fetchFn: mockFetch as unknown as typeof fetch,
    });
    const api = refereeAdminEndpoints(client);

    const result = await api.gameLeagues();

    expect(mockFetch.mock.calls[0]![0]).toBe("https://example.test/admin/referees/game-leagues");
    expect(result.leagues).toEqual([]);
  });
});
