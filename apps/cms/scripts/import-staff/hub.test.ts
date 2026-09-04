import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type Database } from "@dragons/db";
import type * as DbModule from "@dragons/db";

import {
  activeSeasonEntries,
  existingStaff,
  existingStaffKeys,
  insertStaff,
  openHub,
  setStaffPortrait,
} from "./hub";

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
  set: (values: unknown) => Chain;
  returning: () => Chain;
  then: (resolve: (rows: unknown[]) => void) => void;
}

function queryStub(rows: unknown[], calls: { set?: unknown } = {}): Chain {
  const chain: Chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    values: () => chain,
    set: (values) => {
      calls.set = values;
      return chain;
    },
    returning: () => chain,
    then: (resolve) => resolve(rows),
  };
  return chain;
}

function dbStub(rows: unknown[]): {
  db: Database;
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  calls: { set?: unknown };
} {
  const calls: { set?: unknown } = {};
  const select = vi.fn(() => queryStub(rows, calls));
  const insert = vi.fn(() => queryStub(rows, calls));
  const update = vi.fn(() => queryStub(rows, calls));
  return { db: { select, insert, update } as unknown as Database, select, insert, update, calls };
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

describe("existingStaff", () => {
  it("returns the rows the entries hold, with the portrait each carries", async () => {
    const rows = [
      { id: 42, teamEntryId: 7, firstName: "Max", lastName: "Mustermann", photoFilename: null },
      { id: 43, teamEntryId: 8, firstName: "Max", lastName: "Mustermann", photoFilename: "a.jpg" },
    ];
    const { db } = dbStub(rows);

    expect(await existingStaff(db, [7, 8])).toEqual(rows);
  });

  it("asks nothing when no entry is touched", async () => {
    const { db, select } = dbStub([]);

    expect(await existingStaff(db, [])).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });
});

describe("setStaffPortrait", () => {
  it("records the object name on the row and touches updatedAt", async () => {
    const { db, update, calls } = dbStub([{ id: 42 }]);

    await setStaffPortrait(db, 42, "uuid.jpg");

    expect(update).toHaveBeenCalledTimes(1);
    expect(calls.set).toMatchObject({ photoFilename: "uuid.jpg", updatedAt: expect.any(Date) });
  });

  it("throws when no row was updated", async () => {
    const { db } = dbStub([]);

    await expect(setStaffPortrait(db, 42, "uuid.jpg")).rejects.toThrow(/staff 42/);
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
