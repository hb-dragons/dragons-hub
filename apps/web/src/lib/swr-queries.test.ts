import { describe, it, expect, vi } from "vitest";
import { makeQueries } from "./swr-queries";
import { SWR_KEYS } from "./swr-keys";
import type { Api } from "@dragons/api-client";

/** A typed-enough mock: every method returns a tagged marker so we can assert dispatch. */
function mockApi() {
  const calls: { method: string; args: unknown[] }[] = [];
  const rec =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return Promise.resolve({ method, args });
    };
  const api = {
    standings: { list: rec("standings.list") },
    matches: { get: rec("matches.get") },
  } as unknown as Api;
  return { api, calls };
}

describe("makeQueries", () => {
  it("standings(): key + dispatch to standings.list", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).standings();
    expect(q.key).toBe(SWR_KEYS.standings);
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "standings.list", args: [] });
  });

  it("matchDetail(id): key + dispatch to matches.get(id)", async () => {
    const { api, calls } = mockApi();
    const q = makeQueries(api).matchDetail(7);
    expect(q.key).toBe(SWR_KEYS.matchDetail(7));
    await q.fetcher();
    expect(calls[0]).toEqual({ method: "matches.get", args: [7] });
  });
});
