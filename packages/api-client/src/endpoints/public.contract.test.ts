import { describe, it, expect, vi } from "vitest";
import { matchListQuerySchema } from "@dragons/contracts";
import { ApiClient } from "../client";
import { publicEndpoints } from "./public";

/** Build a client whose fetch records the outgoing request URL. */
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
  return { api: publicEndpoints(client), calls };
}

describe("public request queries satisfy @dragons/contracts schemas", () => {
  it("getMatches query parses against matchListQuerySchema (full params incl. hasScore:true)", async () => {
    const { api, calls } = recordingClient();
    await api.getMatches({ limit: 10, sort: "desc", leagueId: 5, teamApiId: 7, hasScore: true });
    // GET passes filters as query params — extract what the client actually serialized
    const query = Object.fromEntries(new URL(calls[0]!.url).searchParams);
    const parsed = matchListQuerySchema.safeParse(query);
    expect(parsed.error?.issues, "matchListQuerySchema rejected the getMatches query").toBeUndefined();
  });

  it("getMatches query parses against matchListQuerySchema (minimal empty filter)", async () => {
    const { api, calls } = recordingClient();
    await api.getMatches({});
    const query = Object.fromEntries(new URL(calls[0]!.url).searchParams);
    const parsed = matchListQuerySchema.safeParse(query);
    expect(parsed.error?.issues, "matchListQuerySchema rejected the getMatches query").toBeUndefined();
  });
});
