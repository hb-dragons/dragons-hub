import {
  describe,
  expect,
  it,
  vi,
  beforeAll,
  beforeEach,
  afterAll,
} from "vitest";

// --- Mocks (hoisted before imports) ---

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) =>
          (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

// --- Imports (after mocks) ---

import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";
import { liveScoreboards } from "@dragons/db/schema";
import { getDb } from "../../config/database";
import { getLatestSnapshot } from "./live-snapshot";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

describe("getLatestSnapshot", () => {
  it("returns null when the device has no live row", async () => {
    await expect(getLatestSnapshot("nope")).resolves.toBeNull();
  });

  it("returns the live row for a known device", async () => {
    await getDb()
      .insert(liveScoreboards)
      .values({ deviceId: "d1", scoreHome: 5 });
    const row = await getLatestSnapshot("d1");
    expect(row?.scoreHome).toBe(5);
  });
});
