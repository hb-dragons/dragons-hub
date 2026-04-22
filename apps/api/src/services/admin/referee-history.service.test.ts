import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  db: new Proxy({}, {
    get: (_target, prop) =>
      (dbHolder.ref as Record<string | symbol, unknown>)[prop],
  }),
}));

vi.mock("../../config/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  },
}));

import { resolveHistoryDateRange } from "./referee-history.service";
import { appSettings } from "@dragons/db/schema";
import {
  setupTestDb, resetTestDb, closeTestDb, type TestDbContext,
} from "../../test/setup-test-db";

let ctx: TestDbContext;

beforeAll(async () => { ctx = await setupTestDb(); dbHolder.ref = ctx.db; });
afterAll(async () => { await closeTestDb(ctx); });
beforeEach(async () => { await resetTestDb(ctx); });

describe("resolveHistoryDateRange", () => {
  it("returns user values when both provided", async () => {
    const res = await resolveHistoryDateRange("2024-09-01", "2025-03-31");
    expect(res).toEqual({
      from: "2024-09-01", to: "2025-03-31", source: "user",
    });
  });

  it("reads app_settings when user values absent", async () => {
    await ctx.db.insert(appSettings).values([
      { key: "currentSeasonStart", value: "2025-08-01" },
      { key: "currentSeasonEnd", value: "2026-07-31" },
    ]);
    const res = await resolveHistoryDateRange();
    expect(res).toEqual({
      from: "2025-08-01", to: "2026-07-31", source: "settings",
    });
  });

  it("falls back to Aug-Jul season when settings missing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T00:00:00Z"));
    const res = await resolveHistoryDateRange();
    expect(res).toEqual({
      from: "2025-08-01", to: "2026-07-31", source: "default",
    });
    vi.useRealTimers();
  });

  it("default fallback rolls to current calendar year when month >= Aug", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));
    const res = await resolveHistoryDateRange();
    expect(res).toEqual({
      from: "2026-08-01", to: "2027-07-31", source: "default",
    });
    vi.useRealTimers();
  });
});
