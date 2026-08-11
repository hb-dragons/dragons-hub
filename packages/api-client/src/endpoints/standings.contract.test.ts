import { describe, it, expect, vi } from "vitest";
import { standingsListQuerySchema } from "@dragons/contracts";
import { ApiClient } from "../client";
import { standingsEndpoints } from "./standings";

function recordingClient() {
  const calls: { url: string; method: string }[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? "GET" });
    return new Response("[]", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const client = new ApiClient({
    baseUrl: "https://example.test",
    fetchFn: fetchFn as unknown as typeof fetch,
  });
  return { api: standingsEndpoints(client), calls };
}

describe("standings query satisfies its @dragons/contracts schema", () => {
  it("list() with no season targets the bare path", async () => {
    const { api, calls } = recordingClient();
    await api.list();
    expect(new URL(calls[0]!.url).pathname).toBe("/admin/standings");
    expect(new URL(calls[0]!.url).search).toBe("");
    expect(calls[0]!.method).toBe("GET");
  });

  it("list({ seasonId }) sends a seasonId the contract accepts", async () => {
    const { api, calls } = recordingClient();
    await api.list({ seasonId: 7 });

    const query = Object.fromEntries(new URL(calls[0]!.url).searchParams);
    const parsed = standingsListQuerySchema.safeParse(query);
    expect(
      parsed.error?.issues,
      "standingsListQuerySchema rejected the list query",
    ).toBeUndefined();
    expect(parsed.data).toEqual({ seasonId: 7 });
  });
});
