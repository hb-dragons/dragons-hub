import { describe, it, expect, vi } from "vitest";
import { eventListQuerySchema, triggerEventSchema } from "@dragons/contracts";
import { ApiClient } from "../client";
import { eventEndpoints } from "./event";

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
  return { api: eventEndpoints(client), calls };
}

describe("event request queries/bodies satisfy @dragons/contracts schemas", () => {
  it("list query parses against eventListQuerySchema", async () => {
    const { api, calls } = recordingClient();
    await api.list({
      page: 2,
      limit: 50,
      type: "match.score.changed",
      entityType: "match",
      source: "manual",
      from: "2026-01-01",
      to: "2026-12-31",
      search: "Dragons",
    });
    const url = new URL(calls[0]!.url);
    const parsed = eventListQuerySchema.safeParse(
      Object.fromEntries(url.searchParams),
    );
    expect(
      parsed.error?.issues,
      "eventListQuerySchema rejected the list query",
    ).toBeUndefined();
    expect(url.pathname).toBe("/admin/events");
    expect(calls[0]!.method).toBe("GET");
  });

  it("failed query parses against eventListQuerySchema", async () => {
    const { api, calls } = recordingClient();
    await api.failed({ page: 1, limit: 20 });
    const url = new URL(calls[0]!.url);
    const parsed = eventListQuerySchema.safeParse(
      Object.fromEntries(url.searchParams),
    );
    expect(
      parsed.error?.issues,
      "eventListQuerySchema rejected the failed query",
    ).toBeUndefined();
    expect(url.pathname).toBe("/admin/events/failed");
    expect(calls[0]!.method).toBe("GET");
  });

  it("trigger body parses against triggerEventSchema", async () => {
    const { api, calls } = recordingClient();
    await api.trigger({
      type: "match.time_changed",
      entityType: "match",
      entityId: 123,
      entityName: "Dragons vs. Tigers",
      deepLinkPath: "/admin/matches/123",
      payload: { field: "value" },
      urgencyOverride: "immediate",
    });
    const parsed = triggerEventSchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "triggerEventSchema rejected the trigger body",
    ).toBeUndefined();
    expect(new URL(calls[0]!.url).pathname).toBe("/admin/events/trigger");
    expect(calls[0]!.method).toBe("POST");
  });
});
