import { describe, it, expect, vi } from "vitest";
import {
  adminMatchListQuerySchema,
  gamePlanGhostItemSchema,
  matchListQuerySchema,
  matchUpdateBodySchema,
  matchHistoryQuerySchema,
  alternativeDatesQuerySchema,
} from "@dragons/contracts";
import type { GamePlanGhostItem } from "@dragons/shared";
import { ApiClient } from "../client";
import { matchEndpoints } from "./match";

/** Build a client whose fetch records the outgoing request body. */
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
  return { api: matchEndpoints(client), calls };
}

describe("match request bodies satisfy @dragons/contracts schemas", () => {
  it("list query parses against matchListQuerySchema", async () => {
    const { api, calls } = recordingClient();
    await api.list({
      limit: 20,
      offset: 0,
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      sort: "asc",
    });
    // GET passes filters as query params — extract what the client actually serialized
    const query = Object.fromEntries(new URL(calls[0]!.url).searchParams);
    const parsed = matchListQuerySchema.safeParse(query);
    expect(parsed.error?.issues, "matchListQuerySchema rejected the list query").toBeUndefined();
  });

  it("game plan query asks for ghosts and parses against adminMatchListQuerySchema", async () => {
    const { api, calls } = recordingClient();
    await api.gamePlan({ seasonId: 3 });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/admin/matches");
    const parsed = adminMatchListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    expect(parsed.error?.issues, "adminMatchListQuerySchema rejected the game plan query").toBeUndefined();
    expect(parsed.data).toMatchObject({ includeGhosts: true, seasonId: 3 });
  });

  it("game plan ghost items parse against gamePlanGhostItemSchema", async () => {
    const ghost: GamePlanGhostItem = {
      id: 7, apiMatchId: 70, matchNo: 1, matchDay: 1,
      homeTeamApiId: 100, homeTeamName: "Dragons", homeTeamNameShort: null,
      homeTeamCustomName: null, homeClubId: 1,
      guestTeamApiId: 200, guestTeamName: "Rivals", guestTeamNameShort: null,
      guestTeamCustomName: null, guestClubId: 2,
      homeIsOwnClub: true, guestIsOwnClub: false,
      homeBadgeColor: null, guestBadgeColor: null,
      homeScore: null, guestScore: null,
      leagueId: 1, leagueName: "Oberliga",
      venueId: null, venueName: null, venueStreet: null, venuePostalCode: null,
      venueCity: null, venueNameOverride: null,
      isConfirmed: false, isForfeited: false, isCancelled: false,
      anschreiber: null, zeitnehmer: null, shotclock: null, publicComment: null,
      hasLocalChanges: true, overriddenFields: [], booking: null,
      kind: "ghost",
      kickoffDate: "2026-03-14",
      kickoffTime: "18:00:00",
      effectiveKickoffDate: "2026-03-21",
      effectiveKickoffTime: "16:00:00",
      overrideReason: null,
      overrideAuthorName: "Petra Planer",
    };
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ items: [ghost], total: 0, limit: 1000, offset: 0, hasMore: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const api = matchEndpoints(
      new ApiClient({ baseUrl: "https://example.test", fetchFn: fetchFn as unknown as typeof fetch }),
    );
    const { items } = await api.gamePlan();
    const parsed = gamePlanGhostItemSchema.safeParse(items[0]);
    expect(parsed.error?.issues, "gamePlanGhostItemSchema rejected the ghost item").toBeUndefined();
  });

  it("history query parses against matchHistoryQuerySchema", async () => {
    const { api, calls } = recordingClient();
    await api.history(1, { limit: 50, offset: 0 });
    const query = Object.fromEntries(new URL(calls[0]!.url).searchParams);
    const parsed = matchHistoryQuerySchema.safeParse(query);
    expect(parsed.error?.issues, "matchHistoryQuerySchema rejected the history query").toBeUndefined();
  });

  it("update body parses against matchUpdateBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.update(5, {
      kickoffDate: "2026-06-15",
      kickoffTime: "19:30",
      isCancelled: false,
      venueNameOverride: "Sporthalle West",
      venueId: 42,
      changeReason: "Schedule update",
    });
    const parsed = matchUpdateBodySchema.safeParse(calls[0]!.body);
    expect(parsed.error?.issues, "matchUpdateBodySchema rejected the request body").toBeUndefined();
  });

  it("alternative-dates query parses against alternativeDatesQuerySchema", async () => {
    const { api, calls } = recordingClient();
    await api.alternativeDates(7, { from: "2026-03-01", to: "2026-05-31" });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/admin/matches/7/alternative-dates");
    const parsed = alternativeDatesQuerySchema.safeParse(
      Object.fromEntries(url.searchParams),
    );
    expect(
      parsed.error?.issues,
      "alternativeDatesQuerySchema rejected the finder query",
    ).toBeUndefined();
  });

  it("alternative-dates sends no range when the caller passes none", async () => {
    const { api, calls } = recordingClient();
    await api.alternativeDates(7);
    const url = new URL(calls[0]!.url);
    expect(url.search).toBe("");
    expect(alternativeDatesQuerySchema.safeParse({}).success).toBe(true);
  });

  it("releaseOverride percent-encodes the fieldName path segment", async () => {
    const { api, calls } = recordingClient();
    await api.releaseOverride(3, "venueNameOverride");
    expect(calls[0]!.url).toContain(
      `/admin/matches/3/overrides/${encodeURIComponent("venueNameOverride")}`,
    );
  });
});
