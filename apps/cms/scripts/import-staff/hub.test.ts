import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type Database } from "@dragons/db";
import type * as DbModule from "@dragons/db";

import { activeSeasonEntries, existingStaffKeys, insertStaff, openHub } from "./hub";

vi.mock("@dragons/db", async (importOriginal) => ({
  ...(await importOriginal<typeof DbModule>()),
  createDb: vi.fn(),
}));

/**
 * Drizzle's builders are chainable and awaited at the end, so one object that
 * returns itself from every step and resolves to the given rows stands in for
 * all of them. What these tests pin is the shape of the result — the SQL
 * itself is exercised for real by the API's PGlite suite.
 */
interface Chain {
  from: () => Chain;
  innerJoin: () => Chain;
  where: () => Chain;
  values: () => Chain;
  returning: () => Chain;
  then: (resolve: (rows: unknown[]) => void) => void;
}

function queryStub(rows: unknown[]): Chain {
  const chain: Chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    values: () => chain,
    returning: () => chain,
    then: (resolve) => resolve(rows),
  };
  return chain;
}

function dbStub(rows: unknown[]): { db: Database; select: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn> } {
  const select = vi.fn(() => queryStub(rows));
  const insert = vi.fn(() => queryStub(rows));
  return { db: { select, insert } as unknown as Database, select, insert };
}

describe("openHub", () => {
  beforeEach(() => {
    vi.mocked(createDb).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("opens the hub database on DATABASE_URL", () => {
    vi.stubEnv("DATABASE_URL", "postgres://hub");
    openHub();

    expect(createDb).toHaveBeenCalledWith("postgres://hub");
  });

  it("throws by name when DATABASE_URL is missing", () => {
    vi.stubEnv("DATABASE_URL", "");

    expect(() => openHub()).toThrow("DATABASE_URL is not set");
  });
});

describe("activeSeasonEntries", () => {
  it("maps the federation permanent id onto the entry id", async () => {
    const { db } = dbStub([
      { permanentId: 100, entryId: 7 },
      { permanentId: 200, entryId: 8 },
    ]);

    expect(await activeSeasonEntries(db)).toEqual(
      new Map([
        [100, 7],
        [200, 8],
      ]),
    );
  });
});

describe("existingStaffKeys", () => {
  it("keys the rows the entries already hold", async () => {
    const { db } = dbStub([{ teamEntryId: 7, firstName: "Max", lastName: "Mustermann" }]);

    expect(await existingStaffKeys(db, [7])).toEqual(new Set(["7|max|mustermann"]));
  });

  it("asks nothing when no entry is touched", async () => {
    const { db, select } = dbStub([]);

    expect(await existingStaffKeys(db, [])).toEqual(new Set());
    expect(select).not.toHaveBeenCalled();
  });
});

describe("insertStaff", () => {
  const row = {
    teamEntryId: 7,
    firstName: "Max",
    lastName: "Mustermann",
    role: "trainer" as const,
    phone: null,
    email: null,
    licence: null,
  };

  it("counts what came back", async () => {
    const { db } = dbStub([{ id: 1 }]);

    expect(await insertStaff(db, [row])).toBe(1);
  });

  it("writes nothing for an empty plan", async () => {
    const { db, insert } = dbStub([]);

    expect(await insertStaff(db, [])).toBe(0);
    expect(insert).not.toHaveBeenCalled();
  });
});
