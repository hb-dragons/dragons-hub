import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";
import type { GamePlanItem, PaginatedResponse } from "@dragons/shared";
import type { CurrentRemoteSnapshot } from "@dragons/db/schema";

// --- Mocks (hoisted before imports) ---
//
// Ghost entries are a query over overrides and remote snapshots, so the
// database is real (PGlite). Only the permission gate is stubbed.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

vi.mock("../../middleware/rbac", () => ({
  requirePermission: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => next()),
}));

// --- Subject (imported after mocks) ---

import { matchRoutes } from "./match.routes";
import { errorHandler } from "../../middleware/error";
import { invalidateActiveSeasonCache } from "../../services/admin/season.service";
import { getOwnClubMatches } from "../../services/admin/match-query.service";
import {
  seasons,
  leagues,
  teams,
  matches,
  matchOverrides,
  matchRemoteVersions,
} from "@dragons/db/schema";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", matchRoutes);

let ctx: TestDbContext;
let seasonId: number;
let leagueId: number;
let otherLeagueId: number;
let apiMatchId = 5000;

const OWN_SQUAD = 100;
const OWN_SECOND_SQUAD = 150;
const OPPONENT_SQUAD = 200;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  invalidateActiveSeasonCache();
  const [season] = await ctx.db
    .insert(seasons)
    .values({ name: "2025/26", status: "active" })
    .returning({ id: seasons.id });
  seasonId = season!.id;
  const leagueRows = await ctx.db
    .insert(leagues)
    .values([
      { apiLigaId: 1, ligaNr: 1, name: "Oberliga", seasonId: 2025, seasonName: "2025/26", seasonRefId: seasonId },
      { apiLigaId: 2, ligaNr: 2, name: "Kreisliga", seasonId: 2025, seasonName: "2025/26", seasonRefId: seasonId },
    ])
    .returning({ id: leagues.id });
  leagueId = leagueRows[0]!.id;
  otherLeagueId = leagueRows[1]!.id;
  await ctx.db.insert(teams).values([
    { apiTeamPermanentId: OWN_SQUAD, seasonTeamId: 1, teamCompetitionId: 1, name: "Dragons 1", clubId: 1, isOwnClub: true },
    { apiTeamPermanentId: OWN_SECOND_SQUAD, seasonTeamId: 2, teamCompetitionId: 2, name: "Dragons 2", clubId: 1, isOwnClub: true },
    { apiTeamPermanentId: OPPONENT_SQUAD, seasonTeamId: 3, teamCompetitionId: 3, name: "Rivals", clubId: 2 },
  ]);
});

afterAll(async () => {
  await closeTestDb(ctx);
});

interface Kickoff {
  date: string;
  time: string;
}

/**
 * Seed a synced game. `effective` is what `matches` holds; `official` is the
 * federation's value in the latest remote snapshot (defaults to effective).
 */
async function seedGame(opts: {
  effective: Kickoff;
  official?: Kickoff;
  overrides?: string[];
  isCancelled?: boolean;
  isForfeited?: boolean;
  league?: number;
  home?: number;
  homeScore?: number;
}): Promise<number> {
  const official = opts.official ?? opts.effective;
  apiMatchId++;
  const [row] = await ctx.db
    .insert(matches)
    .values({
      apiMatchId,
      matchNo: apiMatchId,
      matchDay: 1,
      kickoffDate: opts.effective.date,
      kickoffTime: opts.effective.time,
      leagueId: opts.league ?? leagueId,
      homeTeamApiId: opts.home ?? OWN_SQUAD,
      guestTeamApiId: OPPONENT_SQUAD,
      isCancelled: opts.isCancelled ?? false,
      isForfeited: opts.isForfeited ?? false,
      homeScore: opts.homeScore ?? null,
      guestScore: opts.homeScore ?? null,
      currentRemoteVersion: 2,
    })
    .returning({ id: matches.id });
  const id = row!.id;
  const snapshot = (kickoff: Kickoff) =>
    ({ kickoffDate: kickoff.date, kickoffTime: kickoff.time }) as CurrentRemoteSnapshot;
  // Version 1 is stale on purpose: the ghost must follow the current version.
  await ctx.db.insert(matchRemoteVersions).values([
    { matchId: id, versionNumber: 1, snapshot: snapshot({ date: "2026-01-01", time: "12:00:00" }), dataHash: "a" },
    { matchId: id, versionNumber: 2, snapshot: snapshot(official), dataHash: "b" },
  ]);
  for (const fieldName of opts.overrides ?? []) {
    await ctx.db.insert(matchOverrides).values({ matchId: id, fieldName, changedBy: "user-1" });
  }
  return id;
}

/** A game moved by override from Saturday 14.03. to Saturday 21.03. */
function seedMovedGame(extra: Partial<Parameters<typeof seedGame>[0]> = {}) {
  return seedGame({
    effective: { date: "2026-03-21", time: "16:00:00" },
    official: { date: "2026-03-14", time: "18:00:00" },
    overrides: ["kickoffDate", "kickoffTime"],
    ...extra,
  });
}

async function gamePlan(query: Record<string, string>): Promise<PaginatedResponse<GamePlanItem>> {
  const res = await app.request(`/matches?${new URLSearchParams({ includeGhosts: "true", ...query })}`);
  expect(res.status).toBe(200);
  return (await res.json()) as PaginatedResponse<GamePlanItem>;
}

const MARCH_14 = { dateFrom: "2026-03-14", dateTo: "2026-03-14" };
const MARCH_21 = { dateFrom: "2026-03-21", dateTo: "2026-03-21" };
const BOTH_WEEKENDS = { dateFrom: "2026-03-14", dateTo: "2026-03-21" };

const ghosts = (r: PaginatedResponse<GamePlanItem>) => r.items.filter((i) => i.kind === "ghost");
const reals = (r: PaginatedResponse<GamePlanItem>) => r.items.filter((i) => i.kind === "match");

describe("GET /matches?includeGhosts=true — ghost entries", () => {
  it("emits a ghost on the official day with official and effective kickoff", async () => {
    const id = await seedMovedGame();

    const result = await gamePlan(MARCH_14);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      kind: "ghost",
      id,
      kickoffDate: "2026-03-14",
      kickoffTime: "18:00:00",
      effectiveKickoffDate: "2026-03-21",
      effectiveKickoffTime: "16:00:00",
      homeTeamName: "Dragons 1",
      guestTeamName: "Rivals",
      leagueName: "Oberliga",
    });
  });

  it("does not count the ghost in total", async () => {
    await seedMovedGame();

    const result = await gamePlan(MARCH_14);

    expect(result.total).toBe(0);
    expect(result.hasMore).toBe(false);
  });

  it("emits no ghost for a same-day time-only override", async () => {
    await seedGame({
      effective: { date: "2026-03-14", time: "20:00:00" },
      official: { date: "2026-03-14", time: "18:00:00" },
      overrides: ["kickoffTime"],
    });

    const result = await gamePlan(MARCH_14);

    expect(ghosts(result)).toEqual([]);
    expect(reals(result)).toHaveLength(1);
  });

  it("emits no ghost when the date override names the official day", async () => {
    await seedGame({
      effective: { date: "2026-03-14", time: "18:00:00" },
      overrides: ["kickoffDate"],
    });

    expect(ghosts(await gamePlan(MARCH_14))).toEqual([]);
  });

  it("emits no ghost for a venue-only override", async () => {
    await seedGame({
      effective: { date: "2026-03-21", time: "16:00:00" },
      official: { date: "2026-03-14", time: "18:00:00" },
      overrides: ["venueId"],
    });

    expect(ghosts(await gamePlan(BOTH_WEEKENDS))).toEqual([]);
  });

  it("emits no ghost without any override", async () => {
    await seedGame({
      effective: { date: "2026-03-21", time: "16:00:00" },
      official: { date: "2026-03-14", time: "18:00:00" },
    });

    expect(ghosts(await gamePlan(BOTH_WEEKENDS))).toEqual([]);
  });

  it.each([
    ["cancelled", { isCancelled: true }],
    ["forfeited", { isForfeited: true }],
  ])("emits no ghost for a %s game", async (_label, flags) => {
    await seedMovedGame(flags);

    const result = await gamePlan(BOTH_WEEKENDS);

    expect(ghosts(result)).toEqual([]);
    expect(reals(result)).toHaveLength(1);
  });

  it("yields the real row and the ghost when both days are in range", async () => {
    const id = await seedMovedGame();

    const result = await gamePlan(BOTH_WEEKENDS);

    expect(result.items.map((i) => [i.kind, i.id, i.kickoffDate])).toEqual([
      ["ghost", id, "2026-03-14"],
      ["match", id, "2026-03-21"],
    ]);
    expect(result.total).toBe(1);
  });

  it("yields only the real row when only the effective day is in range", async () => {
    await seedMovedGame();

    const result = await gamePlan(MARCH_21);

    expect(result.items.map((i) => i.kind)).toEqual(["match"]);
  });

  it("yields ghosts without a date range", async () => {
    await seedMovedGame();

    const result = await gamePlan({});

    expect(result.items.map((i) => i.kind)).toEqual(["ghost", "match"]);
  });

  it("follows the current remote version, not an older snapshot", async () => {
    await seedMovedGame();

    // Version 1 of the seeded game names 2026-01-01.
    expect(ghosts(await gamePlan({ dateFrom: "2026-01-01", dateTo: "2026-01-01" }))).toEqual([]);
  });

  it("applies the league filter to the ghost", async () => {
    await seedMovedGame({ league: otherLeagueId });

    expect(ghosts(await gamePlan({ ...MARCH_14, leagueId: String(leagueId) }))).toEqual([]);
    expect(ghosts(await gamePlan({ ...MARCH_14, leagueId: String(otherLeagueId) }))).toHaveLength(1);
  });

  it("applies the squad filter to the ghost", async () => {
    await seedMovedGame({ home: OWN_SECOND_SQUAD });

    expect(ghosts(await gamePlan({ ...MARCH_14, teamApiId: String(OWN_SQUAD) }))).toEqual([]);
    expect(
      ghosts(await gamePlan({ ...MARCH_14, teamApiId: String(OWN_SECOND_SQUAD) })),
    ).toHaveLength(1);
  });

  it("applies the score filter to the ghost", async () => {
    await seedMovedGame({ homeScore: 80 });

    expect(ghosts(await gamePlan({ ...MARCH_14, hasScore: "false" }))).toEqual([]);
    expect(ghosts(await gamePlan({ ...MARCH_14, hasScore: "true" }))).toHaveLength(1);
  });

  it("applies the season filter to the ghost", async () => {
    const [other] = await ctx.db
      .insert(seasons)
      .values({ name: "2026/27", status: "upcoming" })
      .returning({ id: seasons.id });
    await seedMovedGame();

    expect(ghosts(await gamePlan({ ...MARCH_14, seasonId: String(other!.id) }))).toEqual([]);
  });

  it("sorts the ghost by official kickoff, after a real game at the same kickoff", async () => {
    const early = await seedGame({ effective: { date: "2026-03-14", time: "14:00:00" } });
    const moved = await seedMovedGame();
    const sameKickoff = await seedGame({ effective: { date: "2026-03-14", time: "18:00:00" } });
    const late = await seedGame({ effective: { date: "2026-03-14", time: "20:00:00" } });

    const result = await gamePlan(MARCH_14);

    expect(result.items.map((i) => [i.kind, i.id])).toEqual([
      ["match", early],
      ["match", sameKickoff],
      ["ghost", moved],
      ["match", late],
    ]);
  });

  it("reads a snapshot time without seconds as the same kickoff", async () => {
    const moved = await seedMovedGame({ official: { date: "2026-03-14", time: "18:00" } });
    const sameKickoff = await seedGame({ effective: { date: "2026-03-14", time: "18:00:00" } });

    const result = await gamePlan(MARCH_14);

    expect(result.items.map((i) => [i.kind, i.id, i.kickoffTime])).toEqual([
      ["match", sameKickoff, "18:00:00"],
      ["ghost", moved, "18:00:00"],
    ]);
  });

  it("emits no ghost when the current snapshot names no official kickoff time", async () => {
    const id = await seedMovedGame();
    await ctx.client.query(
      `UPDATE match_remote_versions SET snapshot = snapshot - 'kickoffTime' WHERE match_id = $1`,
      [id],
    );

    expect(ghosts(await gamePlan(MARCH_14))).toEqual([]);
  });

  it("keeps the ghost after the real game at the same kickoff when sorting descending", async () => {
    const moved = await seedMovedGame();
    const sameKickoff = await seedGame({ effective: { date: "2026-03-14", time: "18:00:00" } });
    const late = await seedGame({ effective: { date: "2026-03-14", time: "20:00:00" } });

    const result = await gamePlan({ ...MARCH_14, sort: "desc" });

    expect(result.items.map((i) => [i.kind, i.id])).toEqual([
      ["match", late],
      ["match", sameKickoff],
      ["ghost", moved],
    ]);
  });

  it("returns an empty plan when the club has no squads", async () => {
    await seedMovedGame();
    await ctx.db.update(teams).set({ isOwnClub: false });

    const result = await gamePlan(BOTH_WEEKENDS);

    expect(result).toMatchObject({ items: [], total: 0 });
  });

  it("disappears once the override is released", async () => {
    const id = await seedMovedGame();
    const res = await app.request(`/matches/${id}/overrides/kickoffDate`, { method: "DELETE" });
    expect(res.status).toBe(200);

    expect(ghosts(await gamePlan(BOTH_WEEKENDS))).toEqual([]);
  });
});

describe("ghost entries stay off every other list", () => {
  it("GET /matches without includeGhosts returns plain match items", async () => {
    await seedMovedGame();

    const res = await app.request(`/matches?${new URLSearchParams(BOTH_WEEKENDS)}`);
    const body = (await res.json()) as PaginatedResponse<Record<string, unknown>>;

    expect(body.total).toBe(1);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).not.toHaveProperty("kind");
  });

  it("includeGhosts=false behaves like leaving it off", async () => {
    await seedMovedGame();

    const res = await app.request(`/matches?${new URLSearchParams({ ...MARCH_14, includeGhosts: "false" })}`);
    const body = (await res.json()) as PaginatedResponse<unknown>;

    expect(body.items).toEqual([]);
  });

  it("getOwnClubMatches (public list, ICS, dashboard) never returns ghosts", async () => {
    await seedMovedGame();

    const result = await getOwnClubMatches({ limit: 100, offset: 0, ...MARCH_14 });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});
