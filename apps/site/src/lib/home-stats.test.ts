import { describe, expect, it } from "vitest";

import { fetchTeamCount, yearsSinceFounding } from "./home-stats";

describe("yearsSinceFounding", () => {
  it("computes full calendar years since the founding year", () => {
    expect(yearsSinceFounding(2011, new Date("2026-08-02"))).toBe(15);
  });

  it("is zero in the founding year itself", () => {
    expect(yearsSinceFounding(2026, new Date("2026-01-01"))).toBe(0);
  });
});

function fetchReturning(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status })) as typeof fetch;
}

describe("fetchTeamCount", () => {
  it("reads clubStats.teamCount from /public/home/dashboard", async () => {
    let requested = "";
    const fetchImpl = (async (input: string | URL | Request) => {
      requested = String(input);
      return new Response(JSON.stringify({ clubStats: { teamCount: 9 } }), { status: 200 });
    }) as typeof fetch;
    await expect(fetchTeamCount("https://api.example", fetchImpl)).resolves.toBe(9);
    expect(requested).toBe("https://api.example/public/home/dashboard");
  });

  it("tolerates a trailing slash on the base URL", async () => {
    let requested = "";
    const fetchImpl = (async (input: string | URL | Request) => {
      requested = String(input);
      return new Response(JSON.stringify({ clubStats: { teamCount: 3 } }), { status: 200 });
    }) as typeof fetch;
    await fetchTeamCount("https://api.example/", fetchImpl);
    expect(requested).toBe("https://api.example/public/home/dashboard");
  });

  it("throws on a non-200 response", async () => {
    await expect(fetchTeamCount("https://api.example", fetchReturning(503, {}))).rejects.toThrow(
      /HTTP 503/,
    );
  });

  it("throws on an unexpected response shape", async () => {
    await expect(
      fetchTeamCount("https://api.example", fetchReturning(200, { clubStats: {} })),
    ).rejects.toThrow();
  });
});
