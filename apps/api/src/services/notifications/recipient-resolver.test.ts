import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  dbSelect: vi.fn(),
}));

vi.mock("../../config/database", () => ({
  db: { select: (...args: unknown[]) => mocks.dbSelect(...args) },
}));

vi.mock("@dragons/db/schema", () => ({
  user: { id: "id", role: "role", refereeId: "referee_id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: string, val: unknown) => ({ eq: [col, val] })),
}));

import { resolveRecipientUserIds } from "./recipient-resolver";

function mockSelectReturning(rows: unknown[]) {
  mocks.dbSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dbSelect.mockReset();
});

describe("resolveRecipientUserIds", () => {
  it("resolves referee:N to the linked user id", async () => {
    mockSelectReturning([{ id: "user_abc" }]);
    const result = await resolveRecipientUserIds("referee:42");
    expect(result).toEqual(["user_abc"]);
  });

  it("returns empty when no user has that refereeId", async () => {
    mockSelectReturning([]);
    const result = await resolveRecipientUserIds("referee:999");
    expect(result).toEqual([]);
  });

  it("returns empty for referee:non-numeric", async () => {
    const result = await resolveRecipientUserIds("referee:abc");
    expect(result).toEqual([]);
    expect(mocks.dbSelect).not.toHaveBeenCalled();
  });

  it("resolves audience:admin to all admin user ids", async () => {
    mockSelectReturning([{ id: "admin_1" }, { id: "admin_2" }]);
    const result = await resolveRecipientUserIds("audience:admin");
    expect(result).toEqual(["admin_1", "admin_2"]);
  });

  it("resolves user:X to [X] without a DB query", async () => {
    const result = await resolveRecipientUserIds("user:raw_id");
    expect(result).toEqual(["raw_id"]);
    expect(mocks.dbSelect).not.toHaveBeenCalled();
  });

  it("returns empty for unknown prefix", async () => {
    const result = await resolveRecipientUserIds("something:else");
    expect(result).toEqual([]);
    expect(mocks.dbSelect).not.toHaveBeenCalled();
  });
});
