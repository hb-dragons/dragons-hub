import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---

const mockSelect = vi.fn();
const mockFrom = vi.fn();

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
}));

vi.mock("../../config/database", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return { from: (...fArgs: unknown[]) => {
        mockFrom(...fArgs);
        return mocks.from();
      }};
    },
  },
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

// --- Imports (after mocks) ---

import { publicTeamRoutes } from "./team.routes";
import { errorHandler } from "../../middleware/error";

// Test app without auth middleware
const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", publicTeamRoutes);

function json(response: Response) {
  return response.json();
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /teams (public)", () => {
  it("returns 200 with team list", async () => {
    const teamList = [
      { id: 1, name: "Dragons Herren 1", nameShort: "Dragons H1", isOwnClub: true },
      { id: 2, name: "Dragons Herren 2", nameShort: null, isOwnClub: true },
    ];
    mocks.from.mockResolvedValue(teamList);

    const res = await app.request("/teams");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(teamList);
  });

  it("returns 200 with empty array when no teams exist", async () => {
    mocks.from.mockResolvedValue([]);

    const res = await app.request("/teams");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual([]);
  });
});
