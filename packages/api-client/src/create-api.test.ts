import { describe, it, expect, vi } from "vitest";
import { ApiClient } from "./client";
import { createApi } from "./create-api";

function client() {
  const fetchFn = vi.fn(async () => new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }));
  return new ApiClient({ baseUrl: "https://x.test", fetchFn: fetchFn as unknown as typeof fetch });
}

describe("createApi", () => {
  it("exposes the existing groups as namespaces", () => {
    const api = createApi(client());
    expect(typeof api.public.getMatches).toBe("function");
    expect(typeof api.devices.register).toBe("function");
    expect(typeof api.referees.getGames).toBe("function");
    expect(typeof api.boards.listBoards).toBe("function");
  });
});
