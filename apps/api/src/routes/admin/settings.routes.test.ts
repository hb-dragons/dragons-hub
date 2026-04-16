import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  getClubConfig: vi.fn(),
  setClubConfig: vi.fn(),
  getBookingSettings: vi.fn(),
  setBookingSettings: vi.fn(),
  getSetting: vi.fn(),
  upsertSetting: vi.fn(),
  triggerRefereeGamesSync: vi.fn(),
}));

vi.mock("../../services/admin/settings.service", () => ({
  getClubConfig: mocks.getClubConfig,
  setClubConfig: mocks.setClubConfig,
  getBookingSettings: mocks.getBookingSettings,
  setBookingSettings: mocks.setBookingSettings,
  getSetting: mocks.getSetting,
  upsertSetting: mocks.upsertSetting,
}));

vi.mock("../../workers/queues", () => ({
  triggerRefereeGamesSync: mocks.triggerRefereeGamesSync,
}));

vi.mock("../../middleware/auth", () => ({
  requireAdmin: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

// --- Imports (after mocks) ---

import { settingsRoutes } from "./settings.routes";
import { errorHandler } from "../../middleware/error";

const app = new Hono<AppEnv>();
app.use("/*", async (c, next) => {
  c.set("user", { id: "test-admin" } as never);
  await next();
});
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

describe("GET /settings/booking", () => {
  it("returns booking config", async () => {
    const config = { bufferBefore: 60, bufferAfter: 60, gameDuration: 90, dueDaysBefore: 7 };
    mocks.getBookingSettings.mockResolvedValue(config);

    const res = await app.request("/settings/booking");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(config);
    expect(mocks.getBookingSettings).toHaveBeenCalledOnce();
  });
});

describe("PUT /settings/booking", () => {
  it("sets booking config", async () => {
    mocks.setBookingSettings.mockResolvedValue(undefined);

    const body = { bufferBefore: 45, bufferAfter: 30, gameDuration: 120, dueDaysBefore: 14 };
    const res = await app.request("/settings/booking", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(body);
    expect(mocks.setBookingSettings).toHaveBeenCalledWith(body);
  });

  it("returns 400 for missing fields", async () => {
    const res = await app.request("/settings/booking", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bufferBefore: 60 }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for negative bufferBefore", async () => {
    const res = await app.request("/settings/booking", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bufferBefore: -1, bufferAfter: 60, gameDuration: 90, dueDaysBefore: 7 }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for zero gameDuration", async () => {
    const res = await app.request("/settings/booking", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bufferBefore: 60, bufferAfter: 60, gameDuration: 0, dueDaysBefore: 7 }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for non-integer values", async () => {
    const res = await app.request("/settings/booking", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bufferBefore: 60.5, bufferAfter: 60, gameDuration: 90, dueDaysBefore: 7 }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("accepts zero for buffer values and dueDaysBefore", async () => {
    mocks.setBookingSettings.mockResolvedValue(undefined);

    const body = { bufferBefore: 0, bufferAfter: 0, gameDuration: 90, dueDaysBefore: 0 };
    const res = await app.request("/settings/booking", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(body);
  });
});

describe("GET /settings/referee-reminders", () => {
  it("returns stored reminder days", async () => {
    mocks.getSetting.mockResolvedValue(JSON.stringify([7, 3, 1]));

    const res = await app.request("/settings/referee-reminders");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ days: [7, 3, 1] });
    expect(mocks.getSetting).toHaveBeenCalledWith("referee_reminder_days");
  });

  it("returns default [7, 3, 1] when not configured", async () => {
    mocks.getSetting.mockResolvedValue(null);

    const res = await app.request("/settings/referee-reminders");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ days: [7, 3, 1] });
  });
});

describe("PUT /settings/referee-reminders", () => {
  it("saves and returns reminder days", async () => {
    mocks.upsertSetting.mockResolvedValue(undefined);

    const res = await app.request("/settings/referee-reminders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: [1, 3, 7] }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.days).toEqual([7, 3, 1]);
    expect(mocks.upsertSetting).toHaveBeenCalledWith(
      "referee_reminder_days",
      JSON.stringify([7, 3, 1]),
    );
  });

  it("sorts days in descending order", async () => {
    mocks.upsertSetting.mockResolvedValue(undefined);

    const res = await app.request("/settings/referee-reminders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: [2, 14, 5] }),
    });

    expect(res.status).toBe(200);
    expect((await json(res)).days).toEqual([14, 5, 2]);
  });

  it("returns 400 for invalid body", async () => {
    const res = await app.request("/settings/referee-reminders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: "not-an-array" }),
    });

    expect(res.status).toBe(400);
  });
});

describe("POST /settings/referee-games-sync", () => {
  it("triggers sync and returns syncRunId", async () => {
    mocks.triggerRefereeGamesSync.mockResolvedValue({ syncRunId: 42 });

    const res = await app.request("/settings/referee-games-sync", {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.syncRunId).toBe(42);
    expect(mocks.triggerRefereeGamesSync).toHaveBeenCalledWith("test-admin");
  });

  it("returns 409 when sync already in progress", async () => {
    mocks.triggerRefereeGamesSync.mockResolvedValue(null);

    const res = await app.request("/settings/referee-games-sync", {
      method: "POST",
    });

    expect(res.status).toBe(409);
    expect(await json(res)).toMatchObject({ error: "Referee games sync already in progress or queued" });
  });
});
