import { describe, it, expect, vi } from "vitest";
import {
  refereeListQuerySchema,
  refereeVisibilityBodySchema,
  updateRefereeRulesBodySchema,
  refereeHistoryFilterSchema,
  refereeHistoryGamesQuerySchema,
} from "@dragons/contracts";
import { ApiClient } from "../client";
import { refereeAdminEndpoints } from "./referee-admin";

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
  return { api: refereeAdminEndpoints(client), calls };
}

describe("referee-admin request queries/bodies satisfy @dragons/contracts schemas", () => {
  it("listReferees query parses against refereeListQuerySchema", async () => {
    const { api, calls } = recordingClient();
    await api.listReferees({
      limit: 50,
      offset: 0,
      search: "Smith",
      scope: "own",
      sort: "workloadDesc",
    });
    const url = new URL(calls[0]!.url);
    const parsed = refereeListQuerySchema.safeParse(
      Object.fromEntries(url.searchParams),
    );
    expect(
      parsed.error?.issues,
      "refereeListQuerySchema rejected the list query",
    ).toBeUndefined();
    expect(url.pathname).toBe("/admin/referees");
    expect(calls[0]!.method).toBe("GET");
  });

  it("refereeCounts hits the counts path", async () => {
    const { api, calls } = recordingClient();
    await api.refereeCounts();
    expect(new URL(calls[0]!.url).pathname).toBe("/admin/referees/counts");
    expect(calls[0]!.method).toBe("GET");
  });

  it("getReferee hits the by-id path", async () => {
    const { api, calls } = recordingClient();
    await api.getReferee(42);
    expect(new URL(calls[0]!.url).pathname).toBe("/admin/referees/42");
    expect(calls[0]!.method).toBe("GET");
  });

  it("setVisibility body parses against refereeVisibilityBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.setVisibility(7, {
      isOwnClub: true,
      allowAllHomeGames: false,
      allowAwayGames: true,
    });
    const parsed = refereeVisibilityBodySchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "refereeVisibilityBodySchema rejected the visibility body",
    ).toBeUndefined();
    expect(new URL(calls[0]!.url).pathname).toBe("/admin/referees/7/visibility");
    expect(calls[0]!.method).toBe("PATCH");
  });

  it("getRules hits the rules path", async () => {
    const { api, calls } = recordingClient();
    await api.getRules(7);
    expect(new URL(calls[0]!.url).pathname).toBe("/admin/referees/7/rules");
    expect(calls[0]!.method).toBe("GET");
  });

  it("updateRules body parses against updateRefereeRulesBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.updateRules(7, {
      rules: [
        { teamId: 1, deny: false, allowSr1: true, allowSr2: false },
        { teamId: 2, deny: true, allowSr1: false, allowSr2: false },
      ],
    });
    const parsed = updateRefereeRulesBodySchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "updateRefereeRulesBodySchema rejected the rules body",
    ).toBeUndefined();
    expect(new URL(calls[0]!.url).pathname).toBe("/admin/referees/7/rules");
    expect(calls[0]!.method).toBe("PATCH");
  });

  it("historySummary query parses against refereeHistoryFilterSchema", async () => {
    const { api, calls } = recordingClient();
    await api.historySummary({
      dateFrom: "2026-01-01",
      dateTo: "2026-06-30",
      league: "BBL",
      status: "played,cancelled",
    });
    const url = new URL(calls[0]!.url);
    const parsed = refereeHistoryFilterSchema.safeParse(
      Object.fromEntries(url.searchParams),
    );
    expect(
      parsed.error?.issues,
      "refereeHistoryFilterSchema rejected the summary query",
    ).toBeUndefined();
    expect(url.pathname).toBe("/admin/referee/history/summary");
    expect(calls[0]!.method).toBe("GET");
  });

  it("historyGames query parses against refereeHistoryGamesQuerySchema", async () => {
    const { api, calls } = recordingClient();
    await api.historyGames({
      dateFrom: "2026-01-01",
      dateTo: "2026-06-30",
      league: "BBL",
      status: "played",
      search: "Dragons",
      limit: 50,
      offset: 0,
      refereeApiId: 12345,
    });
    const url = new URL(calls[0]!.url);
    const parsed = refereeHistoryGamesQuerySchema.safeParse(
      Object.fromEntries(url.searchParams),
    );
    expect(
      parsed.error?.issues,
      "refereeHistoryGamesQuerySchema rejected the games query",
    ).toBeUndefined();
    expect(url.pathname).toBe("/admin/referee/history/games");
    expect(calls[0]!.method).toBe("GET");
  });
});
