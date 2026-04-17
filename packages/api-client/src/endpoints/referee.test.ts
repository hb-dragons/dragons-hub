import { describe, it, expect, vi } from "vitest";
import { ApiClient } from "../client";
import { refereeEndpoints } from "./referee";

describe("refereeEndpoints", () => {
  it("GETs /referee/games with default params", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ items: [], total: 0, limit: 100, offset: 0, hasMore: false }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const client = new ApiClient({
      baseUrl: "https://example.test",
      fetchFn: mockFetch as unknown as typeof fetch,
    });
    const api = refereeEndpoints(client);

    const result = await api.getGames();

    expect(mockFetch).toHaveBeenCalledOnce();
    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toBe("https://example.test/referee/games");
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("passes query params when supplied", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ items: [], total: 0, limit: 50, offset: 10, hasMore: false }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const client = new ApiClient({
      baseUrl: "https://example.test",
      fetchFn: mockFetch as unknown as typeof fetch,
    });
    const api = refereeEndpoints(client);

    await api.getGames({ limit: 50, offset: 10, status: "active" });

    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain("/referee/games?");
    expect(url).toContain("limit=50");
    expect(url).toContain("offset=10");
    expect(url).toContain("status=active");
  });
});
