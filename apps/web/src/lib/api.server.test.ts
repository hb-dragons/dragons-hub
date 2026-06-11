import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ toString: () => "session=abc" }),
}));

describe("getServerApi", () => {
  it("returns a namespaced client", async () => {
    const { getServerApi } = await import("./api.server");
    const api = await getServerApi();
    expect(typeof api.boards.listBoards).toBe("function");
  });
});
