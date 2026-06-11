import { describe, it, expect, vi } from "vitest";
import { teamUpdateBodySchema, teamReorderBodySchema } from "@dragons/contracts";
import { ApiClient } from "../client";
import { teamEndpoints } from "./team";

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
  return { api: teamEndpoints(client), calls };
}

describe("team request bodies satisfy @dragons/contracts schemas", () => {
  it("update body parses against teamUpdateBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.update(7, {
      customName: "Dragons U16",
      estimatedGameDuration: 90,
      badgeColor: "red",
    });
    const parsed = teamUpdateBodySchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "teamUpdateBodySchema rejected the update body",
    ).toBeUndefined();
    expect(calls[0]!.url).toContain("/admin/teams/7");
    expect(calls[0]!.method).toBe("PATCH");
  });

  it("update body with nulls parses against teamUpdateBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.update(7, {
      customName: null,
      estimatedGameDuration: null,
      badgeColor: null,
    });
    const parsed = teamUpdateBodySchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "teamUpdateBodySchema rejected the update body with nulls",
    ).toBeUndefined();
  });

  it("reorder body parses against teamReorderBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.reorder({ teamIds: [3, 1, 2] });
    const parsed = teamReorderBodySchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "teamReorderBodySchema rejected the reorder body",
    ).toBeUndefined();
    expect(calls[0]!.url).toContain("/admin/teams/order");
    expect(calls[0]!.method).toBe("PUT");
  });
});

describe("team read endpoint targets the right path + verb", () => {
  it("list targets the teams collection with GET", async () => {
    const { api, calls } = recordingClient();
    await api.list();
    expect(calls[0]!.url).toContain("/admin/teams");
    expect(calls[0]!.method).toBe("GET");
  });
});
