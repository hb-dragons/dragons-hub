import { describe, it, expect, vi } from "vitest";
import { ApiClient } from "../client";
import { standingsEndpoints } from "./standings";

/** Build a client whose fetch records the outgoing request url + method + body. */
function recordingClient() {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url: String(url), method: init?.method ?? "GET", body });
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

describe("standings endpoints hit the right path/verb", () => {
  it("list issues GET /admin/standings", async () => {
    const { api, calls } = recordingClient();
    await api.list();
    expect(new URL(calls[0]!.url).pathname).toBe("/admin/standings");
    expect(calls[0]!.method).toBe("GET");
  });
});
