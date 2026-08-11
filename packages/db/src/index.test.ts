import { afterEach, describe, expect, it } from "vitest";
import { is, Table } from "drizzle-orm";
import type { Pool } from "pg";
import { createDb } from "./index";
import * as schema from "./schema";
import { matches } from "./schema";

const pools: Pool[] = [];

/** Build a db, remembering its pool so the test run does not leak handles. */
function build(connectionString = "postgresql://user:pw@127.0.0.1:5432/dragons_test") {
  const created = createDb(connectionString);
  pools.push(created.pool);
  return created;
}

afterEach(async () => {
  await Promise.all(pools.splice(0).map((pool) => pool.end()));
});

describe("createDb", () => {
  it("passes the connection string through to the pool", () => {
    const { pool } = build("postgresql://dragons:dragons@db.example:6543/dragons");

    expect(pool.options.connectionString).toBe(
      "postgresql://dragons:dragons@db.example:6543/dragons",
    );
  });

  it("applies the pool tuning the API depends on", () => {
    const { pool } = build();

    // These three are the whole reason createDb exists rather than callers
    // newing up a Pool themselves. Changing one is a deployment decision.
    expect(pool.options.max).toBe(10);
    expect(pool.options.idleTimeoutMillis).toBe(30_000);
    expect(pool.options.connectionTimeoutMillis).toBe(2_000);
  });

  it("does not open a connection eagerly", () => {
    const { pool } = build();

    // Construction happens at module load in the API. If it dialled the
    // database here, an unreachable DB would crash the process at import time
    // instead of failing the first query.
    expect(pool.totalCount).toBe(0);
    expect(pool.idleCount).toBe(0);
    expect(pool.waitingCount).toBe(0);
  });

  it("returns an independent pool per call", () => {
    const first = build();
    const second = build();

    expect(first.pool).not.toBe(second.pool);
    expect(first.db).not.toBe(second.db);
  });

  it("registers every schema table on the relational query builder", () => {
    const { db } = build();

    const tableExports = Object.entries(schema)
      .filter(([, value]) => is(value, Table))
      .map(([name]) => name);

    // Sanity check on the filter itself — if this ever drops to zero the
    // assertion below would pass vacuously.
    expect(tableExports.length).toBeGreaterThan(20);
    expect(Object.keys(db.query).sort()).toEqual(tableExports.sort());
  });

  it("builds SQL against the schema without touching the database", () => {
    const { db } = build();

    const { sql, params } = db.select({ id: matches.id }).from(matches).toSQL();

    expect(sql).toContain('from "matches"');
    expect(params).toEqual([]);
  });
});
