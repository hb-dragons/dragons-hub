// apps/api/src/routes/admin/season.routes.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

const mocks = vi.hoisted(() => ({
  listSeasons: vi.fn(),
  createSeason: vi.fn(),
  activateSeason: vi.fn(),
  archiveSeason: vi.fn(),
  browseLeagues: vi.fn(),
  setSeasonLeagues: vi.fn(),
  getTrackedLeagues: vi.fn(),
}));
vi.mock("../../services/admin/season.service", () => ({
  listSeasons: mocks.listSeasons,
  createSeason: mocks.createSeason,
  activateSeason: mocks.activateSeason,
  archiveSeason: mocks.archiveSeason,
}));
vi.mock("../../services/admin/league-discovery.service", () => ({
  browseLeagues: mocks.browseLeagues,
  setSeasonLeagues: mocks.setSeasonLeagues,
  getTrackedLeagues: mocks.getTrackedLeagues,
}));
vi.mock("../../middleware/rbac", () => ({
  requirePermission: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => next()),
}));
vi.mock("../../config/logger", () => ({ logger: { error: vi.fn() } }));

import { seasonRoutes } from "./season.routes";
import { errorHandler } from "../../middleware/error";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", seasonRoutes);
const json = (r: Response) => r.json();
beforeEach(() => vi.clearAllMocks());

describe("GET /seasons", () => {
  it("lists seasons", async () => {
    mocks.listSeasons.mockResolvedValue([{ id: 1, name: "2025/26", status: "active", leagueCount: 3 }]);
    const res = await app.request("/seasons");
    expect(res.status).toBe(200);
    expect(await json(res)).toHaveLength(1);
  });
});

describe("POST /seasons", () => {
  it("creates a season", async () => {
    mocks.createSeason.mockResolvedValue({ id: 2, name: "2026/27", status: "upcoming" });
    const res = await app.request("/seasons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "2026/27" }),
    });
    expect(res.status).toBe(200);
    expect(mocks.createSeason).toHaveBeenCalledWith(expect.objectContaining({ name: "2026/27" }));
  });
  it("returns 400 for empty name", async () => {
    const res = await app.request("/seasons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("POST /seasons/:id/activate", () => {
  it("activates a season", async () => {
    mocks.activateSeason.mockResolvedValue({ id: 2, name: "2026/27", status: "active" });
    const res = await app.request("/seasons/2/activate", { method: "POST" });
    expect(res.status).toBe(200);
    expect(mocks.activateSeason).toHaveBeenCalledWith(2);
  });
  it("returns 400 for non-numeric id", async () => {
    const res = await app.request("/seasons/abc/activate", { method: "POST" });
    expect(res.status).toBe(400);
  });
});

describe("POST /seasons/:id/archive", () => {
  it("archives a season", async () => {
    mocks.archiveSeason.mockResolvedValue({ id: 2, name: "2026/27", status: "archived" });
    const res = await app.request("/seasons/2/archive", { method: "POST" });
    expect(res.status).toBe(200);
    expect(mocks.archiveSeason).toHaveBeenCalledWith(2);
  });
  it("returns 400 for non-numeric id on archive", async () => {
    const res = await app.request("/seasons/abc/archive", { method: "POST" });
    expect(res.status).toBe(400);
  });
});

describe("GET /seasons/:id/discover", () => {
  it("returns browsable leagues", async () => {
    mocks.browseLeagues.mockResolvedValue([{ ligaId: 54136, vorabliga: true, alreadyTracked: false }]);
    const res = await app.request("/seasons/3/discover?vorabligaOnly=true");
    expect(res.status).toBe(200);
    expect(mocks.browseLeagues).toHaveBeenCalledWith({ vorabligaOnly: true, seasonId: 3 });
  });
  it("returns 400 for non-numeric id", async () => {
    const res = await app.request("/seasons/abc/discover");
    expect(res.status).toBe(400);
  });
});

describe("GET /seasons/:id/leagues", () => {
  it("returns tracked leagues for a season", async () => {
    mocks.getTrackedLeagues.mockResolvedValue({ leagueNumbers: [54136], leagues: [{ id: 1, ligaNr: 54136, apiLigaId: 54136, name: "Regionalliga West", seasonName: "2025/26", ownClubRefs: false }] });
    const res = await app.request("/seasons/3/leagues");
    expect(res.status).toBe(200);
    expect(mocks.getTrackedLeagues).toHaveBeenCalledWith(3);
  });
  it("returns 400 for non-numeric id", async () => {
    const res = await app.request("/seasons/abc/leagues");
    expect(res.status).toBe(400);
  });
});

describe("PUT /seasons/:id/leagues", () => {
  it("sets season leagues", async () => {
    mocks.setSeasonLeagues.mockResolvedValue({ tracked: 1, untracked: 0 });
    const res = await app.request("/seasons/3/leagues", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ligaIds: [54136] }),
    });
    expect(res.status).toBe(200);
    expect(mocks.setSeasonLeagues).toHaveBeenCalledWith(3, [54136]);
  });
  it("returns 400 for a non-array ligaIds", async () => {
    const res = await app.request("/seasons/3/leagues", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ligaIds: "x" }),
    });
    expect(res.status).toBe(400);
  });
  it("returns 400 for non-numeric id", async () => {
    const res = await app.request("/seasons/abc/leagues", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ligaIds: [54136] }),
    });
    expect(res.status).toBe(400);
  });
});
