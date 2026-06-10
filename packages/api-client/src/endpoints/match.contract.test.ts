import { describe, it, expect, vi } from "vitest";
import {
  matchListQuerySchema,
  matchUpdateBodySchema,
  matchHistoryQuerySchema,
} from "@dragons/contracts";
import { ApiClient } from "../client";
import { matchEndpoints } from "./match";

/** Build a client whose fetch records the outgoing request body. */
function recordingClient() {
  const calls: { url: string; body: unknown }[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url: String(url), body });
    return new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const client = new ApiClient({
    baseUrl: "https://example.test",
    fetchFn: fetchFn as unknown as typeof fetch,
  });
  return { api: matchEndpoints(client), calls };
}

describe("match request bodies satisfy @dragons/contracts schemas", () => {
  it("list query parses against matchListQuerySchema", async () => {
    const { api, calls } = recordingClient();
    await api.list({
      limit: 20,
      offset: 0,
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      sort: "asc",
    });
    // GET passes filters as query params — extract what the client actually serialized
    const query = Object.fromEntries(new URL(calls[0]!.url).searchParams);
    const parsed = matchListQuerySchema.safeParse(query);
    expect(parsed.error?.issues, "matchListQuerySchema rejected the list query").toBeUndefined();
  });

  it("history query parses against matchHistoryQuerySchema", async () => {
    const { api, calls } = recordingClient();
    await api.history(1, { limit: 50, offset: 0 });
    const query = Object.fromEntries(new URL(calls[0]!.url).searchParams);
    const parsed = matchHistoryQuerySchema.safeParse(query);
    expect(parsed.error?.issues, "matchHistoryQuerySchema rejected the history query").toBeUndefined();
  });

  it("update body parses against matchUpdateBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.update(5, {
      kickoffDate: "2026-06-15",
      kickoffTime: "19:30",
      isCancelled: false,
      venueNameOverride: "Sporthalle West",
      venueId: 42,
      changeReason: "Schedule update",
    });
    const parsed = matchUpdateBodySchema.safeParse(calls[0]!.body);
    expect(parsed.error?.issues, "matchUpdateBodySchema rejected the request body").toBeUndefined();
  });

  it("releaseOverride percent-encodes the fieldName path segment", async () => {
    const { api, calls } = recordingClient();
    await api.releaseOverride(3, "venueNameOverride");
    expect(calls[0]!.url).toContain(
      `/admin/matches/3/overrides/${encodeURIComponent("venueNameOverride")}`,
    );
  });
});
