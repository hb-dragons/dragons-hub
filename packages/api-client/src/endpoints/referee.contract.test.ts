import { describe, it, expect, vi } from "vitest";
import { refereeGamesQuerySchema, refereeClaimBodySchema } from "@dragons/contracts";
import { ApiClient } from "../client";
import { refereeEndpoints } from "./referee";

/** Build a client whose fetch records the outgoing request URL and body. */
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
  return { api: refereeEndpoints(client), calls };
}

describe("referee request queries/bodies satisfy @dragons/contracts schemas", () => {
  it("getGames query parses against refereeGamesQuerySchema (full params)", async () => {
    const { api, calls } = recordingClient();
    await api.getGames({
      limit: 10,
      status: "active",
      league: "BezLA,BezLB",
      dateFrom: "2026-01-01",
      search: "x",
    });
    const query = Object.fromEntries(new URL(calls[0]!.url).searchParams);
    const parsed = refereeGamesQuerySchema.safeParse(query);
    expect(parsed.error?.issues, "refereeGamesQuerySchema rejected the getGames query").toBeUndefined();
  });

  it("getGames query parses against refereeGamesQuerySchema (minimal empty params)", async () => {
    const { api, calls } = recordingClient();
    await api.getGames({});
    const query = Object.fromEntries(new URL(calls[0]!.url).searchParams);
    const parsed = refereeGamesQuerySchema.safeParse(query);
    expect(parsed.error?.issues, "refereeGamesQuerySchema rejected the getGames query").toBeUndefined();
  });

  it("claimGame body parses against refereeClaimBodySchema (with slotNumber)", async () => {
    const { api, calls } = recordingClient();
    await api.claimGame(5, { slotNumber: 1 });
    const parsed = refereeClaimBodySchema.safeParse(calls[0]!.body);
    expect(parsed.error?.issues, "refereeClaimBodySchema rejected the claimGame body").toBeUndefined();
  });

  it("claimGame body parses against refereeClaimBodySchema (no params — sends {})", async () => {
    const { api, calls } = recordingClient();
    await api.claimGame(5);
    // client.post sends params ?? {} — so body is {}
    const parsed = refereeClaimBodySchema.safeParse(calls[0]!.body ?? {});
    expect(parsed.error?.issues, "refereeClaimBodySchema rejected the empty claimGame body").toBeUndefined();
  });
});
