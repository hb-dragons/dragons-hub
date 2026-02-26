import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  getReferees: vi.fn(),
}));

vi.mock("../../services/admin/referee-admin.service", () => ({
  getReferees: mocks.getReferees,
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

// --- Imports (after mocks) ---

import { refereeRoutes } from "./referee.routes";
import { errorHandler } from "../../middleware/error";

// Test app without auth middleware
const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", refereeRoutes);

function json(response: Response) {
  return response.json();
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /referees", () => {
  it("returns referee list with default limit of 1000", async () => {
    const listResult = { items: [], total: 0, limit: 1000, offset: 0, hasMore: false };
    mocks.getReferees.mockResolvedValue(listResult);

    const res = await app.request("/referees");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(listResult);
    expect(mocks.getReferees).toHaveBeenCalledWith({ limit: 1000, offset: 0 });
  });

  it("passes query params to service", async () => {
    mocks.getReferees.mockResolvedValue({ items: [], total: 0, limit: 10, offset: 5, hasMore: false });

    await app.request("/referees?limit=10&offset=5&search=Mueller");

    expect(mocks.getReferees).toHaveBeenCalledWith({
      limit: 10,
      offset: 5,
      search: "Mueller",
    });
  });

  it("returns referees with all fields", async () => {
    const listResult = {
      items: [
        {
          id: 1,
          apiId: 100,
          firstName: "Max",
          lastName: "Mustermann",
          licenseNumber: 12345,
          matchCount: 5,
          roles: ["1. Schiedsrichter"],
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-15T00:00:00.000Z",
        },
      ],
      total: 1,
      limit: 1000,
      offset: 0,
      hasMore: false,
    };
    mocks.getReferees.mockResolvedValue(listResult);

    const res = await app.request("/referees");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(listResult);
  });

  it("returns 400 for negative limit", async () => {
    const res = await app.request("/referees?limit=-1");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for limit exceeding max", async () => {
    const res = await app.request("/referees?limit=1001");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for negative offset", async () => {
    const res = await app.request("/referees?offset=-1");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for non-numeric limit", async () => {
    const res = await app.request("/referees?limit=abc");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for empty search string", async () => {
    const res = await app.request("/referees?search=");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("omits search when not provided", async () => {
    mocks.getReferees.mockResolvedValue({ items: [], total: 0, limit: 1000, offset: 0, hasMore: false });

    await app.request("/referees");

    expect(mocks.getReferees).toHaveBeenCalledWith({ limit: 1000, offset: 0 });
  });
});
