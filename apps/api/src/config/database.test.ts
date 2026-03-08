import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./env", () => ({
  env: { DATABASE_URL: "postgresql://test:test@localhost:5432/test" },
}));

const mockPool = { end: vi.fn().mockResolvedValue(undefined) };
const mockDb = { select: vi.fn(), insert: vi.fn() };
const mockCreateDb = vi.fn().mockReturnValue({ db: mockDb, pool: mockPool });
vi.mock("@dragons/db", () => ({
  createDb: (...args: unknown[]) => mockCreateDb(...args),
}));

describe("database config", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockCreateDb.mockReturnValue({ db: mockDb, pool: mockPool });
  });

  it("creates db lazily on first access", async () => {
    const { db } = await import("./database");

    // Access a property to trigger initialization
    void db.select;

    expect(mockCreateDb).toHaveBeenCalledWith("postgresql://test:test@localhost:5432/test");
  });

  it("reuses the same db instance", async () => {
    const { db } = await import("./database");

    void db.select;
    void db.insert;

    expect(mockCreateDb).toHaveBeenCalledTimes(1);
  });

  it("closeDb() ends the pool", async () => {
    const { db, closeDb } = await import("./database");

    // Trigger initialization
    void db.select;

    await closeDb();

    expect(mockPool.end).toHaveBeenCalled();
  });

  it("closeDb() is safe when db not initialized", async () => {
    const { closeDb } = await import("./database");

    // Should not throw when pool doesn't exist
    await closeDb();

    expect(mockPool.end).not.toHaveBeenCalled();
  });
});
