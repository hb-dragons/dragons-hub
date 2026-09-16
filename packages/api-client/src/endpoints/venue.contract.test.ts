import { describe, it, expect, vi } from "vitest";
import {
  venueSearchQuerySchema,
  hallTimeListQuerySchema,
  hallTimeImportBodySchema,
  hallTimeUpsertBodySchema,
} from "@dragons/contracts";
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

describe("hall-time request bodies + queries satisfy @dragons/contracts schemas", () => {
  const open = { date: "2026-09-19", kind: "open" as const, startTime: "10:00", endTime: "22:00", note: null };

  it("hallTimes query parses against hallTimeListQuerySchema", async () => {
    const { api, calls } = recordingClient();
    await api.hallTimes(7, { from: "2026-09-01", to: "2026-09-30" });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/admin/venues/7/hall-times");
    expect(
      hallTimeListQuerySchema.safeParse(Object.fromEntries(url.searchParams)).error?.issues,
    ).toBeUndefined();
  });

  it("import preview + apply bodies parse against hallTimeImportBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.previewHallTimeImport(7, { rows: [open], updatedOn: "2026-09-14" });
    await api.importHallTimes(7, { rows: [open] });
    expect(calls.map((c) => [new URL(c.url).pathname, c.method])).toEqual([
      ["/admin/venues/7/hall-times/import/preview", "POST"],
      ["/admin/venues/7/hall-times/import", "POST"],
    ]);
    for (const call of calls) {
      expect(hallTimeImportBodySchema.safeParse(call.body).error?.issues).toBeUndefined();
    }
  });

  it("upsert body parses against hallTimeUpsertBodySchema and delete targets the day", async () => {
    const { api, calls } = recordingClient();
    await api.upsertHallTime(7, "2026-09-19", { kind: "closed", startTime: null, endTime: null, note: "Ferien" });
    await api.deleteHallTime(7, "2026-09-19");
    expect(new URL(calls[0]!.url).pathname).toBe("/admin/venues/7/hall-times/2026-09-19");
    expect(calls[0]!.method).toBe("PUT");
    expect(hallTimeUpsertBodySchema.safeParse(calls[0]!.body).error?.issues).toBeUndefined();
    expect(calls[1]!.method).toBe("DELETE");
  });
});
