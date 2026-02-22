import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  getTrackedLeagues: vi.fn(),
  resolveAndSaveLeagues: vi.fn(),
}));

vi.mock("../../services/admin/league-discovery.service", () => ({
  getTrackedLeagues: mocks.getTrackedLeagues,
  resolveAndSaveLeagues: mocks.resolveAndSaveLeagues,
}));

// --- Imports (after mocks) ---

import { leagueRoutes } from "./league.routes";
import { errorHandler } from "../../middleware/error";

const app = new Hono();
app.onError(errorHandler);
app.route("/", leagueRoutes);

function json(response: Response) {
  return response.json();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /settings/leagues", () => {
  it("returns tracked leagues", async () => {
    const result = {
      leagueNumbers: [4102, 4105],
      leagues: [
        { id: 1, ligaNr: 4102, apiLigaId: 58001, name: "Regionalliga West", seasonName: "2025/26" },
        { id: 2, ligaNr: 4105, apiLigaId: 58002, name: "Oberliga", seasonName: "2025/26" },
      ],
    };
    mocks.getTrackedLeagues.mockResolvedValue(result);

    const res = await app.request("/settings/leagues");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(result);
  });

  it("returns empty state when no tracked leagues", async () => {
    mocks.getTrackedLeagues.mockResolvedValue({ leagueNumbers: [], leagues: [] });

    const res = await app.request("/settings/leagues");

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.leagueNumbers).toEqual([]);
    expect(body.leagues).toHaveLength(0);
  });
});

describe("PUT /settings/leagues", () => {
  it("resolves and saves league numbers", async () => {
    const result = {
      resolved: [{ ligaNr: 4102, ligaId: 58001, name: "Regionalliga West", seasonName: "2025/26" }],
      notFound: [],
      tracked: 1,
      untracked: 0,
    };
    mocks.resolveAndSaveLeagues.mockResolvedValue(result);

    const res = await app.request("/settings/leagues", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leagueNumbers: [4102] }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(result);
    expect(mocks.resolveAndSaveLeagues).toHaveBeenCalledWith([4102]);
  });

  it("accepts empty league numbers array", async () => {
    const result = { resolved: [], notFound: [], tracked: 0, untracked: 2 };
    mocks.resolveAndSaveLeagues.mockResolvedValue(result);

    const res = await app.request("/settings/leagues", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leagueNumbers: [] }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(result);
  });

  it("returns 400 for missing leagueNumbers", async () => {
    const res = await app.request("/settings/leagues", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for non-array leagueNumbers", async () => {
    const res = await app.request("/settings/leagues", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leagueNumbers: "4102" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for negative numbers", async () => {
    const res = await app.request("/settings/leagues", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leagueNumbers: [-1] }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for non-integer numbers", async () => {
    const res = await app.request("/settings/leagues", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leagueNumbers: [4102.5] }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
