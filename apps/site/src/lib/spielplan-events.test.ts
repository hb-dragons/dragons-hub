import { describe, expect, it } from "vitest";

import { fetchUpcomingMatches, UPCOMING_EVENT_LIMIT } from "./spielplan-events";

const MATCH = {
  kickoffDate: "2026-10-10",
  kickoffTime: "15:00:00",
  homeTeamName: "HB Dragons",
  guestTeamName: "TK Hannover",
  venueName: "IGS Roderbruch",
  venueNameOverride: null,
  venueStreet: "Rotekreuzstraße 23",
  venuePostalCode: "30627",
  venueCity: "Hannover",
};

/** The extra MatchListItem fields the narrow schema must tolerate and strip. */
const EXTRA_FIELDS = { id: 1, matchNo: 77, homeScore: null, isCancelled: false };

function fetchReturning(status: number, body: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
}

describe("fetchUpcomingMatches", () => {
  it("queries /public/matches from today in the club zone, ascending", async () => {
    let requested = "";
    const fetchImpl = (async (input: string | URL | Request) => {
      requested = String(input);
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }) as typeof fetch;

    // 23:30 UTC on Jul 31 is already Aug 1 in Europe/Berlin.
    await fetchUpcomingMatches("https://api.example", new Date("2026-07-31T23:30:00Z"), fetchImpl);

    const url = new URL(requested);
    expect(url.pathname).toBe("/public/matches");
    expect(url.searchParams.get("dateFrom")).toBe("2026-08-01");
    expect(url.searchParams.get("limit")).toBe(String(UPCOMING_EVENT_LIMIT));
    expect(url.searchParams.get("sort")).toBe("asc");
  });

  it("tolerates a trailing slash on the base URL", async () => {
    let requested = "";
    const fetchImpl = (async (input: string | URL | Request) => {
      requested = String(input);
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }) as typeof fetch;
    await fetchUpcomingMatches("https://api.example/", new Date(), fetchImpl);
    expect(new URL(requested).pathname).toBe("/public/matches");
  });

  it("returns the page's items narrowed to the event fields", async () => {
    const fetchImpl = fetchReturning(200, { items: [{ ...MATCH, ...EXTRA_FIELDS }] });
    const matches = await fetchUpcomingMatches("https://api.example", new Date(), fetchImpl);
    expect(matches).toEqual([MATCH]);
  });

  it("throws on a non-200 response", async () => {
    await expect(
      fetchUpcomingMatches("https://api.example", new Date(), fetchReturning(503, {})),
    ).rejects.toThrow(/HTTP 503/);
  });

  it("throws on an unexpected response shape", async () => {
    await expect(
      fetchUpcomingMatches("https://api.example", new Date(), fetchReturning(200, { nope: 1 })),
    ).rejects.toThrow();
  });
});
