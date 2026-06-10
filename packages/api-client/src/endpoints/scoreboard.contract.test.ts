import { describe, it, expect, vi } from "vitest";
import { scoreboardListQuerySchema } from "@dragons/contracts";
import { ApiClient } from "../client";
import { scoreboardEndpoints } from "./scoreboard";

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
  return { api: scoreboardEndpoints(client), calls };
}

describe("scoreboard queries satisfy @dragons/contracts schemas", () => {
  it("snapshots query parses against scoreboardListQuerySchema", async () => {
    const { api, calls } = recordingClient();
    await api.snapshots({ deviceId: "panel-1", limit: 200, afterId: 5 });
    const url = new URL(calls[0]!.url);
    const parsed = scoreboardListQuerySchema.safeParse(
      Object.fromEntries(url.searchParams),
    );
    expect(
      parsed.error?.issues,
      "scoreboardListQuerySchema rejected the snapshots query",
    ).toBeUndefined();
    expect(url.pathname).toBe("/admin/scoreboard/snapshots");
    expect(calls[0]!.method).toBe("GET");
  });

  it("snapshots query with only deviceId parses against scoreboardListQuerySchema", async () => {
    const { api, calls } = recordingClient();
    await api.snapshots({ deviceId: "panel-1" });
    const url = new URL(calls[0]!.url);
    const parsed = scoreboardListQuerySchema.safeParse(
      Object.fromEntries(url.searchParams),
    );
    expect(
      parsed.error?.issues,
      "scoreboardListQuerySchema rejected the deviceId-only snapshots query",
    ).toBeUndefined();
    expect(url.pathname).toBe("/admin/scoreboard/snapshots");
  });
});

describe("scoreboard read endpoints target the right path + verb", () => {
  it("health targets the admin health endpoint with GET + deviceId query", async () => {
    const { api, calls } = recordingClient();
    await api.health("panel-1");
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/admin/scoreboard/health");
    expect(url.searchParams.get("deviceId")).toBe("panel-1");
    expect(calls[0]!.method).toBe("GET");
  });

  it("latest targets the public latest endpoint with GET + deviceId query", async () => {
    const { api, calls } = recordingClient();
    await api.latest("panel-1");
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/public/scoreboard/latest");
    expect(url.searchParams.get("deviceId")).toBe("panel-1");
    expect(calls[0]!.method).toBe("GET");
  });
});
