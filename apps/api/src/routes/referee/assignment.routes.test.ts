import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";
import type {
  AssignRefereeResponse,
  UnassignRefereeResponse,
} from "@dragons/shared";

// --- Mocks (hoisted before imports) ---
//
// drizzle-orm, @dragons/db/schema and both referee services are deliberately
// real here (issue #110). The old version stubbed `eq` to an identity function
// and mocked `assignReferee`/`claimRefereeGame`, then asserted the response
// equalled the fixture it had just fed the mock — so neither the ownership
// lookup nor the actual 200 body was under test, and every AssignmentError code
// was hand-thrown rather than produced by the code path that really raises it.
//
// What stays mocked: the auth gate (`requireRefereeSelf`), the federation SDK
// and the domain-event publisher — the three things a route test has no business
// exercising for real.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({
  searchRefereesForGame: vi.fn(),
  submitRefereeAssignment: vi.fn(),
  submitRefereeUnassignment: vi.fn(),
  publishDomainEvent: vi.fn().mockResolvedValue({ id: "evt-1" }),
  // gate: "allow" | "unauthorized" | "forbidden" — controls requireRefereeSelf response.
  gate: "allow" as "allow" | "unauthorized" | "forbidden",
  refereeId: undefined as number | undefined,
}));

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
  requireRefereeSelf: vi.fn(
    async (
      c: {
        set: (k: string, v: unknown) => void;
        json: (body: unknown, status?: number) => Response;
      },
      next: () => Promise<void>,
    ) => {
      if (mocks.gate === "unauthorized") {
        return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
      }
      if (mocks.gate === "forbidden") {
        return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403);
      }
      c.set("user", { id: "u1", refereeId: mocks.refereeId });
      c.set("session", { id: "s1" });
      if (mocks.refereeId !== undefined) {
        c.set("refereeId", mocks.refereeId);
      }
      await next();
    },
  ),
}));

vi.mock("../../services/sync/sdk-client", () => ({
  sdkClient: {
    searchRefereesForGame: mocks.searchRefereesForGame,
    submitRefereeAssignment: mocks.submitRefereeAssignment,
    submitRefereeUnassignment: mocks.submitRefereeUnassignment,
  },
}));

vi.mock("../../services/events/event-publisher", () => ({
  publishDomainEvent: mocks.publishDomainEvent,
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// --- Subject (imported after mocks) ---

import { refereeAssignmentRoutes } from "./assignment.routes";
import { errorHandler } from "../../middleware/error";
import { refereeGames, referees } from "@dragons/db/schema";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", refereeAssignmentRoutes);

function json(response: Response) {
  return response.json();
}

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
  mocks.searchRefereesForGame.mockReset();
  mocks.submitRefereeAssignment.mockReset();
  mocks.submitRefereeUnassignment.mockReset();
  mocks.publishDomainEvent.mockResolvedValue({ id: "evt-1" });
  mocks.gate = "allow";
  mocks.refereeId = undefined;
});

afterAll(async () => {
  await closeTestDb(ctx);
});

// --- Fixtures & seed helpers ---

const REF_API_ID = 9001;
const SPIELPLAN_ID = 300;

const CANDIDATE = {
  srId: REF_API_ID,
  vorname: "Maria",
  nachName: "Schmidt",
  lizenznr: 100,
  qualiSr1: true,
  qualiSr2: true,
  srModusMismatchSr1: false,
  srModusMismatchSr2: false,
  blocktermin: false,
  zeitraumBlockiert: null,
  meta: { total: 1 },
};

const FEDERATION_OK = {
  game1: { spielplanId: SPIELPLAN_ID },
  gameInfoMessages: ["Änderungen erfolgreich übernommen"],
  editAnythingPossible: true,
};

/** Seed the signed-in referee and put their row id on the auth context. */
async function signInAsReferee(
  opts: {
    apiId?: number;
    isOwnClub?: boolean;
    allowAllHomeGames?: boolean;
    allowAwayGames?: boolean;
  } = {},
): Promise<number> {
  const [row] = await ctx.db
    .insert(referees)
    .values({
      apiId: opts.apiId ?? REF_API_ID,
      firstName: "Maria",
      lastName: "Schmidt",
      isOwnClub: opts.isOwnClub ?? true,
      allowAllHomeGames: opts.allowAllHomeGames ?? true,
      allowAwayGames: opts.allowAwayGames ?? true,
    })
    .returning({ id: referees.id });
  mocks.refereeId = row!.id;
  return row!.id;
}

async function seedGame(
  seed: Partial<typeof refereeGames.$inferInsert> = {},
): Promise<number> {
  const [row] = await ctx.db
    .insert(refereeGames)
    .values({
      apiMatchId: SPIELPLAN_ID,
      matchNo: 42,
      kickoffDate: "2026-04-25",
      kickoffTime: "14:00:00",
      homeTeamName: "Dragons A",
      guestTeamName: "Lions B",
      sr1OurClub: true,
      sr2OurClub: true,
      sr1Status: "open",
      sr2Status: "open",
      isHomeGame: true,
      ...seed,
    })
    .returning({ id: refereeGames.id });
  return row!.id;
}

function federationAccepts() {
  mocks.searchRefereesForGame.mockResolvedValue({ results: [CANDIDATE], total: 1 });
  mocks.submitRefereeAssignment.mockResolvedValue(FEDERATION_OK);
}

async function slotStatuses(apiMatchId = SPIELPLAN_ID) {
  const res = await ctx.client.query<{
    sr1_status: string;
    sr1_referee_api_id: number | null;
    sr2_status: string;
    sr2_referee_api_id: number | null;
  }>(
    `SELECT sr1_status, sr1_referee_api_id, sr2_status, sr2_referee_api_id
     FROM referee_games WHERE api_match_id = $1`,
    [apiMatchId],
  );
  return res.rows[0]!;
}

function assignRequest(body: unknown, spielplanId: number | string = SPIELPLAN_ID) {
  return app.request(`/games/${spielplanId}/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// POST /games/:spielplanId/assign
// ---------------------------------------------------------------------------

describe("POST /games/:spielplanId/assign — gating and validation", () => {
  it("returns 401 when no session", async () => {
    mocks.gate = "unauthorized";

    const res = await assignRequest({ slotNumber: 1, refereeApiId: REF_API_ID });

    expect(res.status).toBe(401);
    expect(await json(res)).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("returns 403 when the user has no referee profile", async () => {
    mocks.gate = "forbidden";

    const res = await assignRequest({ slotNumber: 1, refereeApiId: REF_API_ID });

    expect(res.status).toBe(403);
    expect(await json(res)).toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.submitRefereeAssignment).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed JSON body", async () => {
    await signInAsReferee();

    const res = await assignRequest("not-valid-json");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.submitRefereeAssignment).not.toHaveBeenCalled();
  });

  it("returns 400 when slotNumber is out of range", async () => {
    await signInAsReferee();

    const res = await assignRequest({ slotNumber: 5, refereeApiId: REF_API_ID });

    expect(res.status).toBe(400);
    expect(mocks.submitRefereeAssignment).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric spielplanId with the shared validation envelope", async () => {
    await signInAsReferee();

    const res = await assignRequest({ slotNumber: 1, refereeApiId: REF_API_ID }, "abc");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.submitRefereeAssignment).not.toHaveBeenCalled();
  });
});

describe("POST /games/:spielplanId/assign — ownership", () => {
  it("returns 403 when the signed-in referee's apiId differs from the body's", async () => {
    await signInAsReferee({ apiId: 9999 });
    await seedGame();
    federationAccepts();

    const res = await assignRequest({ slotNumber: 1, refereeApiId: REF_API_ID });

    expect(res.status).toBe(403);
    expect(await json(res)).toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.submitRefereeAssignment).not.toHaveBeenCalled();
    expect((await slotStatuses()).sr1_status).toBe("open");
  });

  it("returns 403 NOT_OWN_CLUB for a referee outside our club", async () => {
    await signInAsReferee({ isOwnClub: false });
    await seedGame();
    federationAccepts();

    const res = await assignRequest({ slotNumber: 1, refereeApiId: REF_API_ID });

    expect(res.status).toBe(403);
    expect(await json(res)).toMatchObject({ code: "NOT_OWN_CLUB" });
    expect((await slotStatuses()).sr1_status).toBe("open");
  });

  it("looks the ownership check up against the signed-in referee's own row", async () => {
    // A second referee exists with the body's apiId; the signed-in one does not.
    await ctx.db.insert(referees).values({
      apiId: REF_API_ID,
      firstName: "Someone",
      lastName: "Else",
      isOwnClub: true,
    });
    await signInAsReferee({ apiId: 4242 });
    await seedGame();
    federationAccepts();

    const res = await assignRequest({ slotNumber: 1, refereeApiId: REF_API_ID });

    expect(res.status).toBe(403);
    expect(await json(res)).toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns 403 when the context carries no refereeId (middleware bypass)", async () => {
    await seedGame();
    mocks.refereeId = undefined;

    const res = await assignRequest({ slotNumber: 1, refereeApiId: REF_API_ID });

    expect(res.status).toBe(403);
    expect(await json(res)).toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.submitRefereeAssignment).not.toHaveBeenCalled();
  });
});

describe("POST /games/:spielplanId/assign — success", () => {
  it("assigns the referee and returns an AssignRefereeResponse", async () => {
    await signInAsReferee();
    await seedGame();
    federationAccepts();

    const res = await assignRequest({ slotNumber: 2, refereeApiId: REF_API_ID });
    const body = (await json(res)) as AssignRefereeResponse;

    expect(res.status).toBe(200);
    // The body is produced by the real service against the real row, and is
    // compared to a value typed as the shared response contract.
    const expected: AssignRefereeResponse = {
      success: true,
      slot: "sr2",
      status: "assigned",
      refereeName: "Maria Schmidt",
    };
    expect(body).toEqual(expected);

    expect(await slotStatuses()).toMatchObject({
      sr1_status: "open",
      sr2_status: "assigned",
      sr2_referee_api_id: REF_API_ID,
    });
  });
});

describe("POST /games/:spielplanId/assign — AssignmentError status mapping", () => {
  it("maps GAME_NOT_FOUND to 404 (no such game)", async () => {
    await signInAsReferee();
    federationAccepts();

    const res = await assignRequest({ slotNumber: 1, refereeApiId: REF_API_ID }, 999);

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "GAME_NOT_FOUND" });
  });

  it("maps SLOT_TAKEN to 409 (a rival already holds the slot)", async () => {
    await signInAsReferee();
    await seedGame({ sr1Status: "assigned", sr1RefereeApiId: 5555, sr1Name: "Rival" });
    federationAccepts();

    const res = await assignRequest({ slotNumber: 1, refereeApiId: REF_API_ID });

    expect(res.status).toBe(409);
    expect(await json(res)).toMatchObject({ code: "SLOT_TAKEN" });
    expect((await slotStatuses()).sr1_referee_api_id).toBe(5555);
  });

  it("maps NOT_QUALIFIED to 422 (federation does not list the referee)", async () => {
    await signInAsReferee();
    await seedGame();
    mocks.searchRefereesForGame.mockResolvedValue({ results: [], total: 0 });

    const res = await assignRequest({ slotNumber: 1, refereeApiId: REF_API_ID });

    expect(res.status).toBe(422);
    expect(await json(res)).toMatchObject({ code: "NOT_QUALIFIED" });
  });

  it("maps FEDERATION_ERROR to 502 (federation rejected the submit)", async () => {
    await signInAsReferee();
    await seedGame();
    mocks.searchRefereesForGame.mockResolvedValue({ results: [CANDIDATE], total: 1 });
    mocks.submitRefereeAssignment.mockResolvedValue({
      game1: { spielplanId: SPIELPLAN_ID },
      gameInfoMessages: ["Fehler: Etwas ging schief"],
      editAnythingPossible: true,
    });

    const res = await assignRequest({ slotNumber: 1, refereeApiId: REF_API_ID });

    expect(res.status).toBe(502);
    expect(await json(res)).toMatchObject({ code: "FEDERATION_ERROR" });
    // The rolled-back slot is observable through the API's own state.
    expect((await slotStatuses()).sr1_status).toBe("open");
  });

  it("re-throws unknown errors to the error handler as 500", async () => {
    await signInAsReferee();
    await seedGame();
    mocks.searchRefereesForGame.mockRejectedValue(new Error("Unexpected SDK failure"));

    const res = await assignRequest({ slotNumber: 1, refereeApiId: REF_API_ID });

    expect(res.status).toBe(500);
    expect(await json(res)).toMatchObject({ code: "INTERNAL_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// POST /games/:id/claim
// ---------------------------------------------------------------------------

describe("POST /games/:id/claim", () => {
  it("returns 401 when no session", async () => {
    mocks.gate = "unauthorized";

    const res = await app.request("/games/5/claim", { method: "POST" });

    expect(res.status).toBe(401);
  });

  it("returns 403 when the user has no referee profile", async () => {
    mocks.gate = "forbidden";

    const res = await app.request("/games/5/claim", { method: "POST" });

    expect(res.status).toBe(403);
  });

  it("returns 400 for an invalid id", async () => {
    await signInAsReferee();

    const res = await app.request("/games/abc/claim", { method: "POST" });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 403 when the context carries no refereeId (middleware bypass)", async () => {
    mocks.refereeId = undefined;

    const res = await app.request("/games/5/claim", { method: "POST" });

    expect(res.status).toBe(403);
    expect(await json(res)).toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns 400 for a malformed JSON body", async () => {
    await signInAsReferee();
    await seedGame();

    const res = await app.request("/games/5/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("claims the auto-picked slot when there is no body", async () => {
    // Every field on refereeClaimBodySchema is optional, and Hono's validator
    // sets value = {} when Content-Type is absent (as here — no headers, no
    // body at all), so this bodyless POST must still mean "no slot preference"
    // rather than a 400. The api-client (referee.ts:62) always sends a real
    // `{}` JSON body instead, which the same optional schema parses just as
    // permissively — this test covers the other real client shape: a caller
    // that posts with no body and no Content-Type at all.
    await signInAsReferee();
    const gameId = await seedGame();
    federationAccepts();

    const res = await app.request(`/games/${gameId}/claim`, { method: "POST" });
    const body = (await json(res)) as AssignRefereeResponse;

    expect(res.status).toBe(200);
    const expected: AssignRefereeResponse = {
      success: true,
      slot: "sr1",
      status: "assigned",
      refereeName: "Maria Schmidt",
    };
    expect(body).toEqual(expected);
    expect((await slotStatuses()).sr1_referee_api_id).toBe(REF_API_ID);
  });

  it("claims the auto-picked slot for an explicit empty-object body (the api-client's shape)", async () => {
    // packages/api-client/src/endpoints/referee.ts:62 sends `params ?? {}` with
    // Content-Type: application/json — a real (non-empty) "{}" body, distinct
    // from the no-body/no-Content-Type case above. Both must mean "no slot
    // preference".
    await signInAsReferee();
    const gameId = await seedGame();
    federationAccepts();

    const res = await app.request(`/games/${gameId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const body = (await json(res)) as AssignRefereeResponse;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, slot: "sr1" });
  });

  it("claims the explicitly requested slot", async () => {
    await signInAsReferee();
    const gameId = await seedGame();
    federationAccepts();

    const res = await app.request(`/games/${gameId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 2 }),
    });

    expect(res.status).toBe(200);
    expect(await slotStatuses()).toMatchObject({
      sr1_status: "open",
      sr2_status: "assigned",
      sr2_referee_api_id: REF_API_ID,
    });
  });

  it("maps SLOT_TAKEN to 409", async () => {
    await signInAsReferee();
    const gameId = await seedGame({ sr2Status: "assigned", sr2RefereeApiId: 5555 });
    federationAccepts();

    const res = await app.request(`/games/${gameId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 2 }),
    });

    expect(res.status).toBe(409);
    expect(await json(res)).toMatchObject({ code: "SLOT_TAKEN" });
  });

  it("maps NOT_OWN_CLUB to 403", async () => {
    await signInAsReferee({ isOwnClub: false });
    const gameId = await seedGame();
    federationAccepts();

    const res = await app.request(`/games/${gameId}/claim`, { method: "POST" });

    expect(res.status).toBe(403);
    expect(await json(res)).toMatchObject({ code: "NOT_OWN_CLUB" });
  });

  it("maps GAME_NOT_FOUND to 404", async () => {
    await signInAsReferee();

    const res = await app.request("/games/999/claim", { method: "POST" });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "GAME_NOT_FOUND" });
  });

  it("re-throws unknown errors as 500", async () => {
    await signInAsReferee();
    const gameId = await seedGame();
    mocks.searchRefereesForGame.mockRejectedValue(new Error("boom"));

    const res = await app.request(`/games/${gameId}/claim`, { method: "POST" });

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DELETE /games/:id/claim
// ---------------------------------------------------------------------------

describe("DELETE /games/:id/claim", () => {
  it("returns 401 when no session", async () => {
    mocks.gate = "unauthorized";

    const res = await app.request("/games/5/claim", { method: "DELETE" });

    expect(res.status).toBe(401);
  });

  it("returns 403 when the user has no referee profile", async () => {
    mocks.gate = "forbidden";

    const res = await app.request("/games/5/claim", { method: "DELETE" });

    expect(res.status).toBe(403);
    expect(mocks.submitRefereeUnassignment).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid id", async () => {
    await signInAsReferee();

    const res = await app.request("/games/abc/claim", { method: "DELETE" });

    expect(res.status).toBe(400);
    expect(mocks.submitRefereeUnassignment).not.toHaveBeenCalled();
  });

  it("returns 403 when the context carries no refereeId (middleware bypass)", async () => {
    mocks.refereeId = undefined;

    const res = await app.request("/games/5/claim", { method: "DELETE" });

    expect(res.status).toBe(403);
    expect(await json(res)).toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.submitRefereeUnassignment).not.toHaveBeenCalled();
  });

  it("unclaims the slot and returns an UnassignRefereeResponse", async () => {
    await signInAsReferee();
    const gameId = await seedGame({
      sr1Status: "assigned",
      sr1RefereeApiId: REF_API_ID,
      sr1Name: "Maria Schmidt",
    });
    mocks.submitRefereeUnassignment.mockResolvedValue(FEDERATION_OK);

    const res = await app.request(`/games/${gameId}/claim`, { method: "DELETE" });
    const body = (await json(res)) as UnassignRefereeResponse;

    expect(res.status).toBe(200);
    const expected: UnassignRefereeResponse = {
      success: true,
      slot: "sr1",
      status: "open",
    };
    expect(body).toEqual(expected);
    expect(await slotStatuses()).toMatchObject({
      sr1_status: "open",
      sr1_referee_api_id: null,
    });
  });

  it("maps NOT_ASSIGNED to 409", async () => {
    await signInAsReferee();
    const gameId = await seedGame({
      sr1Status: "assigned",
      sr1RefereeApiId: 5555,
      sr2Status: "assigned",
      sr2RefereeApiId: 6666,
    });

    const res = await app.request(`/games/${gameId}/claim`, { method: "DELETE" });

    expect(res.status).toBe(409);
    expect(await json(res)).toMatchObject({ code: "NOT_ASSIGNED" });
    expect(mocks.submitRefereeUnassignment).not.toHaveBeenCalled();
  });

  it("maps GAME_NOT_FOUND to 404", async () => {
    await signInAsReferee();

    const res = await app.request("/games/999/claim", { method: "DELETE" });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "GAME_NOT_FOUND" });
  });

  it("maps FEDERATION_ERROR to 502", async () => {
    await signInAsReferee();
    const gameId = await seedGame({
      sr1Status: "assigned",
      sr1RefereeApiId: REF_API_ID,
    });
    mocks.submitRefereeUnassignment.mockResolvedValue({
      game1: { spielplanId: SPIELPLAN_ID },
      gameInfoMessages: ["Fehler beim Aufheben"],
      editAnythingPossible: true,
    });

    const res = await app.request(`/games/${gameId}/claim`, { method: "DELETE" });

    expect(res.status).toBe(502);
    expect(await json(res)).toMatchObject({ code: "FEDERATION_ERROR" });
    // The slot must survive a rejected unassignment.
    expect((await slotStatuses()).sr1_referee_api_id).toBe(REF_API_ID);
  });

  it("re-throws unknown errors as 500", async () => {
    await signInAsReferee();
    const gameId = await seedGame({
      sr1Status: "assigned",
      sr1RefereeApiId: REF_API_ID,
    });
    mocks.submitRefereeUnassignment.mockRejectedValue(new Error("boom"));

    const res = await app.request(`/games/${gameId}/claim`, { method: "DELETE" });

    expect(res.status).toBe(500);
  });
});
