import { describe, it, expect, vi } from "vitest";
import {
  broadcastUpsertSchema,
  broadcastStartStopSchema,
  broadcastMatchesQuerySchema,
} from "@dragons/contracts";
import { ApiClient } from "../client";
import { broadcastEndpoints } from "./broadcast";

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
  return { api: broadcastEndpoints(client), calls };
}

describe("broadcast request bodies/queries satisfy @dragons/contracts schemas", () => {
  it("upsertConfig body parses against broadcastUpsertSchema", async () => {
    const { api, calls } = recordingClient();
    await api.upsertConfig({
      deviceId: "panel-1",
      matchId: 42,
      homeAbbr: "DRG",
      guestAbbr: "OPP",
      homeColorOverride: "#ff0000",
      guestColorOverride: null,
    });
    const parsed = broadcastUpsertSchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "broadcastUpsertSchema rejected the upsert body",
    ).toBeUndefined();
    expect(new URL(calls[0]!.url).pathname).toBe("/admin/broadcast/config");
    expect(calls[0]!.method).toBe("PUT");
  });

  it("start body parses against broadcastStartStopSchema", async () => {
    const { api, calls } = recordingClient();
    await api.start({ deviceId: "panel-1" });
    const parsed = broadcastStartStopSchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "broadcastStartStopSchema rejected the start body",
    ).toBeUndefined();
    expect(new URL(calls[0]!.url).pathname).toBe("/admin/broadcast/start");
    expect(calls[0]!.method).toBe("POST");
  });

  it("stop body parses against broadcastStartStopSchema", async () => {
    const { api, calls } = recordingClient();
    await api.stop({ deviceId: "panel-1" });
    const parsed = broadcastStartStopSchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "broadcastStartStopSchema rejected the stop body",
    ).toBeUndefined();
    expect(new URL(calls[0]!.url).pathname).toBe("/admin/broadcast/stop");
    expect(calls[0]!.method).toBe("POST");
  });

  it("matches query parses against broadcastMatchesQuerySchema", async () => {
    const { api, calls } = recordingClient();
    await api.matches({ scope: "all", q: "dragons" });
    const url = new URL(calls[0]!.url);
    const parsed = broadcastMatchesQuerySchema.safeParse(
      Object.fromEntries(url.searchParams),
    );
    expect(
      parsed.error?.issues,
      "broadcastMatchesQuerySchema rejected the matches query",
    ).toBeUndefined();
    expect(url.pathname).toBe("/admin/broadcast/matches");
    expect(calls[0]!.method).toBe("GET");
  });
});

describe("broadcast read endpoints target the right path + verb", () => {
  it("config targets the admin config endpoint with GET + deviceId query", async () => {
    const { api, calls } = recordingClient();
    await api.config("panel-1");
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/admin/broadcast/config");
    expect(url.searchParams.get("deviceId")).toBe("panel-1");
    expect(calls[0]!.method).toBe("GET");
  });

  it("state targets the public state endpoint with GET + deviceId query", async () => {
    const { api, calls } = recordingClient();
    await api.state("panel-1");
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/public/broadcast/state");
    expect(url.searchParams.get("deviceId")).toBe("panel-1");
    expect(calls[0]!.method).toBe("GET");
  });
});
