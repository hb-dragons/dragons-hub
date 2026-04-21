import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

const mocks = vi.hoisted(() => ({
  getRulesForReferee: vi.fn(),
  updateRulesForReferee: vi.fn(),
  dbSelect: vi.fn(),
}));

vi.mock("../../services/referee/referee-rules.service", () => ({
  getRulesForReferee: mocks.getRulesForReferee,
  updateRulesForReferee: mocks.updateRulesForReferee,
}));

vi.mock("../../config/database", () => ({
  db: {
    select: (...args: unknown[]) => mocks.dbSelect(...args),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  teams: { id: "t.id", isOwnClub: "t.isOwnClub" },
  referees: { id: "r.id", isOwnClub: "r.isOwnClub" },
}));

vi.mock("drizzle-orm", () => ({
  inArray: vi.fn((...args: unknown[]) => ({ inArray: args })),
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
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

describe("PUT /referees/:id/rules", () => {
  it("replaces rules for a referee", async () => {
    const body = { rules: [{ teamId: 42, deny: false, allowSr1: true, allowSr2: false }] };
    const rulesResponse = {
      rules: [{ id: 1, teamId: 42, teamName: "Dragons 1", deny: false, allowSr1: true, allowSr2: false }],
    };
    mocks.dbSelect
      .mockReturnValueOnce(refereeLookupChain([{ isOwnClub: true }]))
      .mockReturnValueOnce({ from: () => ({ where: () => [{ id: 42 }] }) });
    mocks.updateRulesForReferee.mockResolvedValue(rulesResponse);

    const res = await app.request("/referees/1/rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(rulesResponse);
    expect(mocks.updateRulesForReferee).toHaveBeenCalledWith(1, body);
  });

  it("returns 400 for non-own-club team IDs", async () => {
    mocks.dbSelect
      .mockReturnValueOnce(refereeLookupChain([{ isOwnClub: true }]))
      .mockReturnValueOnce({ from: () => ({ where: () => [] }) });

    const res = await app.request("/referees/1/rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: [{ teamId: 999, deny: false, allowSr1: true, allowSr2: false }] }),
    });

    expect(res.status).toBe(400);
    expect(mocks.updateRulesForReferee).not.toHaveBeenCalled();
  });

  it("accepts empty rules array (clears all rules)", async () => {
    mocks.dbSelect.mockReturnValueOnce(refereeLookupChain([{ isOwnClub: true }]));
    mocks.updateRulesForReferee.mockResolvedValue({ rules: [] });

    const res = await app.request("/referees/1/rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: [] }),
    });

    expect(res.status).toBe(200);
  });

  it("returns 400 when neither slot is allowed and deny is false", async () => {
    const res = await app.request("/referees/1/rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: [{ teamId: 42, deny: false, allowSr1: false, allowSr2: false }] }),
    });

    expect(res.status).toBe(400);
  });

  it("accepts deny rule with no slots", async () => {
    mocks.dbSelect
      .mockReturnValueOnce(refereeLookupChain([{ isOwnClub: true }]))
      .mockReturnValueOnce({ from: () => ({ where: () => [{ id: 42 }] }) });
    mocks.updateRulesForReferee.mockResolvedValue({ rules: [] });

    const res = await app.request("/referees/1/rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: [{ teamId: 42, deny: true, allowSr1: false, allowSr2: false }] }),
    });

    expect(res.status).toBe(200);
  });

  it("returns 400 for duplicate teamIds", async () => {
    const res = await app.request("/referees/1/rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rules: [
          { teamId: 42, deny: false, allowSr1: true, allowSr2: false },
          { teamId: 42, deny: false, allowSr1: false, allowSr2: true },
        ],
      }),
    });

    expect(res.status).toBe(400);
  });
});

describe("PUT /referees/:id/rules — isOwnClub guard", () => {
  it("returns 400 when referee is not own club", async () => {
    mocks.dbSelect.mockReturnValueOnce(refereeLookupChain([{ isOwnClub: false }]));

    const res = await app.request("/referees/1/rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: [] }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "NOT_OWN_CLUB" });
  });
});
