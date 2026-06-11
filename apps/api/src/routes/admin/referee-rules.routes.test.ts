import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

const mocks = vi.hoisted(() => ({
  getRulesForReferee: vi.fn(),
  dbSelect: vi.fn(),
}));

vi.mock("../../services/referee/referee-rules.service", () => ({
  getRulesForReferee: mocks.getRulesForReferee,
}));

vi.mock("../../config/database", () => ({
  getDb: () => ({
    select: (...args: unknown[]) => mocks.dbSelect(...args),
  }),
}));

vi.mock("@dragons/db/schema", () => ({
  referees: { id: "r.id", isOwnClub: "r.isOwnClub" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
}));

vi.mock("../../middleware/rbac", () => ({
  requirePermission: vi.fn(() =>
    async (_c: unknown, next: () => Promise<void>) => next(),
  ),
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

import { refereeRulesRoutes } from "./referee-rules.routes";
import { errorHandler } from "../../middleware/error";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", refereeRulesRoutes);

function json(response: Response) {
  return response.json();
}

function refereeLookupChain(result: unknown[]) {
  return { from: () => ({ where: () => ({ limit: () => Promise.resolve(result) }) }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /referees/:id/rules", () => {
  it("returns rules for a referee", async () => {
    const rulesResponse = {
      rules: [{ id: 1, teamId: 42, teamName: "Dragons 1", allowSr1: false, allowSr2: true }],
    };
    mocks.dbSelect.mockReturnValueOnce(refereeLookupChain([{ isOwnClub: true }]));
    mocks.getRulesForReferee.mockResolvedValue(rulesResponse);

    const res = await app.request("/referees/1/rules");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(rulesResponse);
    expect(mocks.getRulesForReferee).toHaveBeenCalledWith(1);
  });

  it("returns 400 for non-numeric id", async () => {
    const res = await app.request("/referees/abc/rules");
    expect(res.status).toBe(400);
  });
});

describe("GET /referees/:id/rules — isOwnClub guard", () => {
  it("returns 400 when referee is not own club", async () => {
    mocks.dbSelect.mockReturnValueOnce(refereeLookupChain([{ isOwnClub: false }]));

    const res = await app.request("/referees/1/rules");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "NOT_OWN_CLUB" });
  });

  it("returns 404 when referee not found", async () => {
    mocks.dbSelect.mockReturnValueOnce(refereeLookupChain([]));

    const res = await app.request("/referees/1/rules");

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });
});

