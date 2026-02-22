import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./env", () => ({
  env: { DATABASE_URL: "postgresql://test:test@localhost:5432/test" },
}));

const mockCreateDb = vi.fn().mockReturnValue({ select: vi.fn(), insert: vi.fn() });
vi.mock("@dragons/db", () => ({
  createDb: (...args: unknown[]) => mockCreateDb(...args),
}));

describe("database config", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
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
});
