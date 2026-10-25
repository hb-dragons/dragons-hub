import { describe, it, expect, vi } from "vitest";
import { hallOccupancyQuerySchema } from "@dragons/contracts";
import { ApiClient } from "../client";
import { hallOccupancyEndpoints } from "./hall-occupancy";

function recordingClient() {
  const calls: { url: string; method: string }[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? "GET" });
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  });
  const client = new ApiClient({
    baseUrl: "https://example.test",
    fetchFn: fetchFn as unknown as typeof fetch,
  });
  return { api: hallOccupancyEndpoints(client), calls };
}

describe("hallOccupancy queries satisfy @dragons/contracts schemas", () => {
  it("list query parses against hallOccupancyQuerySchema", async () => {
    const { api, calls } = recordingClient();
    await api.list({ coverage: "partial", venueId: 3 });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/admin/hall-occupancy");
    const parsed = hallOccupancyQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    expect(parsed.error?.issues, "hallOccupancyQuerySchema rejected the list query").toBeUndefined();
    expect(parsed.data).toEqual({ coverage: "partial", venueId: 3 });
  });

  it("list without a query hits the bare path", async () => {
    const { api, calls } = recordingClient();
    await api.list();
    expect(new URL(calls[0]!.url).search).toBe("");
  });
});
