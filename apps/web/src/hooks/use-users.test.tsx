import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  listUsers: vi.fn(),
  capturedFetchers: [] as Array<() => Promise<unknown>>,
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { admin: { listUsers: mocks.listUsers } },
}));

vi.mock("swr", () => ({
  default: (_key: unknown, fetcher: () => Promise<unknown>) => {
    mocks.capturedFetchers.push(fetcher);
    return { data: undefined, error: undefined, isLoading: true };
  },
}));

import { useUsers } from "./use-users";

describe("useUsers fetcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.capturedFetchers.length = 0;
  });

  it("returns a map keyed by user id", async () => {
    mocks.listUsers.mockResolvedValue({
      data: {
        users: [
          { id: "u_a", name: "Alice", email: "a@x.io" },
          { id: "u_b", name: "Bob", email: "b@x.io" },
        ],
      },
      error: null,
    });

    useUsers();
    expect(mocks.capturedFetchers).toHaveLength(1);
    const result = (await mocks.capturedFetchers[0]!()) as Map<
      string,
      { name: string; email: string }
    >;

    expect(result.get("u_a")?.name).toBe("Alice");
    expect(result.get("u_b")?.name).toBe("Bob");
    expect(result.size).toBe(2);
  });

  it("throws from the fetcher when listUsers returns error", async () => {
    mocks.listUsers.mockResolvedValue({
      data: null,
      error: new Error("forbidden"),
    });

    useUsers();
    await expect(mocks.capturedFetchers[0]!()).rejects.toThrow("forbidden");
  });

  it("returns empty map when listUsers returns no users", async () => {
    mocks.listUsers.mockResolvedValue({ data: { users: [] }, error: null });
    useUsers();
    const result = (await mocks.capturedFetchers[0]!()) as Map<string, unknown>;
    expect(result.size).toBe(0);
  });
});
