import { describe, it, expect, vi } from "vitest";
import { createSeasonSchema, seasonLeaguesSchema, browseLeaguesQuerySchema } from "@dragons/contracts";
import { ApiClient } from "../client";
import { seasonsEndpoints } from "./seasons";

function recordingClient() {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url: String(url), method: init?.method ?? "GET", body });
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  });
  const client = new ApiClient({ baseUrl: "https://example.test", fetchFn: fetchFn as unknown as typeof fetch });
  return { api: seasonsEndpoints(client), calls };
}

describe("seasons request bodies satisfy @dragons/contracts schemas", () => {
  it("create body parses against createSeasonSchema", async () => {
    const { api, calls } = recordingClient();
    await api.create({ name: "2026/27", sdkSeasonId: 2026 });
    expect(createSeasonSchema.safeParse(calls[0]!.body).error?.issues).toBeUndefined();
    expect(calls[0]!.method).toBe("POST");
  });
  it("setLeagues body parses against seasonLeaguesSchema", async () => {
    const { api, calls } = recordingClient();
    await api.setLeagues(3, { ligaIds: [54136] });
    expect(seasonLeaguesSchema.safeParse(calls[0]!.body).error?.issues).toBeUndefined();
    expect(calls[0]!.url).toContain("/admin/seasons/3/leagues");
    expect(calls[0]!.method).toBe("PUT");
  });
  it("activate posts to the activate path", async () => {
    const { api, calls } = recordingClient();
    await api.activate(3);
    expect(calls[0]!.url).toContain("/admin/seasons/3/activate");
    expect(calls[0]!.method).toBe("POST");
  });
  it("discover encodes vorabligaOnly query", async () => {
    const { api, calls } = recordingClient();
    await api.discover(3, { vorabligaOnly: true });
    const q = Object.fromEntries(new URL(calls[0]!.url).searchParams);
    expect(q.vorabligaOnly).toBe("true");
  });
  it("browse hits the season-independent path and encodes vorabligaOnly", async () => {
    const { api, calls } = recordingClient();
    await api.browse({ vorabligaOnly: true });
    expect(calls[0]!.url).toContain("/admin/seasons/browse");
    expect(calls[0]!.method).toBe("GET");
    const q = Object.fromEntries(new URL(calls[0]!.url).searchParams);
    expect(q.vorabligaOnly).toBe("true");
    expect(browseLeaguesQuerySchema.safeParse(q).error?.issues).toBeUndefined();
  });
});
