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

  it("GETs /referee/games/:id", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ id: 42, apiMatchId: 1000, matchId: null }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const client = new ApiClient({
      baseUrl: "https://example.test",
      fetchFn: mockFetch as unknown as typeof fetch,
    });
    const api = refereeEndpoints(client);

    const result = await api.getGame(42);

    expect(mockFetch).toHaveBeenCalledOnce();
    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toBe("https://example.test/referee/games/42");
    expect(result.id).toBe(42);
  });

  it("GETs /admin/referee/games/:id/candidates with paging + search", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ total: 0, results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = new ApiClient({
      baseUrl: "https://example.test",
      fetchFn: mockFetch as unknown as typeof fetch,
    });
    const api = refereeEndpoints(client);

    await api.searchAssignmentCandidates(123, {
      slotNumber: 1,
      search: "mu",
      pageFrom: 0,
      pageSize: 15,
    });

    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain("/admin/referee/games/123/candidates?");
    expect(url).toContain("slotNumber=1");
    expect(url).toContain("search=mu");
    expect(url).toContain("pageFrom=0");
    expect(url).toContain("pageSize=15");
  });

  it("POSTs /admin/referee/games/:id/assign with slotNumber + refereeApiId", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          slot: "sr1",
          status: "assigned",
          refereeName: "Mustermann",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const client = new ApiClient({
      baseUrl: "https://example.test",
      fetchFn: mockFetch as unknown as typeof fetch,
    });
    const api = refereeEndpoints(client);

    const result = await api.assignReferee(456, { slotNumber: 2, refereeApiId: 99 });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://example.test/admin/referee/games/456/assign");
    const requestInit = init as RequestInit;
    expect(requestInit.method).toBe("POST");
    expect(JSON.parse(requestInit.body as string)).toEqual({
      slotNumber: 2,
      refereeApiId: 99,
    });
    expect(result.slot).toBe("sr1");
  });

  it("DELETEs /admin/referee/games/:id/assignment/:slotNumber", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, slot: "sr2", status: "open" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const client = new ApiClient({
      baseUrl: "https://example.test",
      fetchFn: mockFetch as unknown as typeof fetch,
    });
    const api = refereeEndpoints(client);

    const result = await api.unassignReferee(789, 2);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://example.test/admin/referee/games/789/assignment/2");
    expect((init as RequestInit).method).toBe("DELETE");
    expect(result.status).toBe("open");
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
