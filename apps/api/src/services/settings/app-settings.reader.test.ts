import { describe, expect, it, beforeAll, beforeEach, afterAll, vi } from "vitest";

// --- Mock setup ---
//
// drizzle-orm and @dragons/db/schema are NOT mocked: the whole point of this
// module is the `inArray` predicate over app_settings.key, so it runs against a
// real (in-process PGlite) Postgres with the real migrations.

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

// --- Imports (after mocks) ---

import { readSettings, readIntSetting } from "./app-settings.reader";
import { appSettings } from "@dragons/db/schema";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";
import { traceQueries, type QueryTrace } from "../../test/trace-queries";

let ctx: TestDbContext;
let trace: QueryTrace;

beforeAll(async () => {
  ctx = await setupTestDb();
  trace = traceQueries(ctx.db as object);
  dbHolder.ref = trace.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  trace.reset();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

describe("readSettings", () => {
  it("returns the requested keys in one query", async () => {
    await ctx.db.insert(appSettings).values([
      { key: "a", value: "1" },
      { key: "b", value: "2" },
      { key: "c", value: "3" },
    ]);

    const values = await readSettings(["a", "b", "c"]);

    expect([...values]).toEqual([
      ["a", "1"],
      ["b", "2"],
      ["c", "3"],
    ]);
    expect(trace.startCount()).toBe(1);
  });

  it("leaves keys with no row out of the map instead of mapping them to null", async () => {
    await ctx.db.insert(appSettings).values({ key: "a", value: "1" });

    const values = await readSettings(["a", "missing"]);

    expect(values.has("missing")).toBe(false);
    expect(values.get("a")).toBe("1");
  });

  it("does not return keys that were not asked for", async () => {
    await ctx.db.insert(appSettings).values([
      { key: "a", value: "1" },
      { key: "b", value: "2" },
    ]);

    expect([...(await readSettings(["a"])).keys()]).toEqual(["a"]);
  });

  it("does not match a row whose value happens to equal a requested key", async () => {
    await ctx.db.insert(appSettings).values({ key: "unrelated", value: "a" });

    expect((await readSettings(["a"])).size).toBe(0);
  });

  it("skips the query entirely for an empty key list", async () => {
    const values = await readSettings([]);

    expect(values.size).toBe(0);
    expect(trace.startCount()).toBe(0);
  });
});

describe("readIntSetting", () => {
  it("parses a stored number", () => {
    expect(readIntSetting(new Map([["k", "42"]]), "k", 7)).toBe(42);
  });

  it("keeps a stored zero", () => {
    expect(readIntSetting(new Map([["k", "0"]]), "k", 7)).toBe(0);
  });

  it("falls back when the key is missing", () => {
    expect(readIntSetting(new Map(), "k", 7)).toBe(7);
  });

  it("falls back when the stored text is not a number", () => {
    expect(readIntSetting(new Map([["k", "abc"]]), "k", 7)).toBe(7);
  });

  it("falls back on an empty string rather than returning NaN", () => {
    expect(readIntSetting(new Map([["k", ""]]), "k", 7)).toBe(7);
  });
});
