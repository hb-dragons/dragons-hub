import { describe, it, expect, vi } from "vitest";
import { venueSearchQuerySchema } from "@dragons/contracts";
import { ApiClient } from "../client";
import { venueEndpoints } from "./venue";

/** Build a client whose fetch records the outgoing request url + method + body. */
function recordingClient() {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url: String(url), method: init?.method ?? "GET", body });
    return new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const client = new ApiClient({
    baseUrl: "https://example.test",
    fetchFn: fetchFn as unknown as typeof fetch,
  });
  return { api: venueEndpoints(client), calls };
}

describe("venue queries satisfy @dragons/contracts schemas", () => {
  it("search query parses against venueSearchQuerySchema", async () => {
    const { api, calls } = recordingClient();
    await api.search({ q: "Sporthalle", limit: 20 });
    const url = new URL(calls[0]!.url);
    const parsed = venueSearchQuerySchema.safeParse(
      Object.fromEntries(url.searchParams),
    );
    expect(
      parsed.error?.issues,
      "venueSearchQuerySchema rejected the search query",
    ).toBeUndefined();
    expect(calls[0]!.method).toBe("GET");
  });

  it("search query with only q parses against venueSearchQuerySchema", async () => {
    const { api, calls } = recordingClient();
    await api.search({ q: "West" });
    const url = new URL(calls[0]!.url);
    const parsed = venueSearchQuerySchema.safeParse(
      Object.fromEntries(url.searchParams),
    );
    expect(
      parsed.error?.issues,
      "venueSearchQuerySchema rejected the q-only search query",
    ).toBeUndefined();
    expect(url.pathname).toBe("/admin/venues/search");
  });
});

describe("venue read endpoints target the right path + verb", () => {
  it("list targets the venues collection with GET", async () => {
    const { api, calls } = recordingClient();
    await api.list();
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/admin/venues");
    expect(calls[0]!.method).toBe("GET");
  });
});
