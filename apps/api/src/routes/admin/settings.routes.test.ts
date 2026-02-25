import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  getClubConfig: vi.fn(),
  setClubConfig: vi.fn(),
}));

vi.mock("../../services/admin/settings.service", () => ({
  getClubConfig: mocks.getClubConfig,
  setClubConfig: mocks.setClubConfig,
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

// --- Imports (after mocks) ---

import { settingsRoutes } from "./settings.routes";
import { errorHandler } from "../../middleware/error";

const app = new Hono();
app.onError(errorHandler);
app.route("/", settingsRoutes);

function json(response: Response) {
  return response.json();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /settings/club", () => {
  it("returns club config when set", async () => {
    mocks.getClubConfig.mockResolvedValue({ clubId: 4121, clubName: "Dragons" });

    const res = await app.request("/settings/club");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ clubId: 4121, clubName: "Dragons" });
  });

  it("returns null when not configured", async () => {
    mocks.getClubConfig.mockResolvedValue(null);

    const res = await app.request("/settings/club");

    expect(res.status).toBe(200);
    expect(await json(res)).toBeNull();
  });
});

describe("PUT /settings/club", () => {
  it("sets club config", async () => {
    mocks.setClubConfig.mockResolvedValue(undefined);

    const res = await app.request("/settings/club", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubId: 4121, clubName: "Dragons" }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ clubId: 4121, clubName: "Dragons" });
    expect(mocks.setClubConfig).toHaveBeenCalledWith(4121, "Dragons");
  });

  it("returns 400 for missing clubId", async () => {
    const res = await app.request("/settings/club", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubName: "Dragons" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for empty clubName", async () => {
    const res = await app.request("/settings/club", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubId: 4121, clubName: "" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for negative clubId", async () => {
    const res = await app.request("/settings/club", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubId: -1, clubName: "Test" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
