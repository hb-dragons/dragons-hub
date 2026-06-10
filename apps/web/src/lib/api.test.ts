import { describe, it, expect } from "vitest";
import { api, APIError } from "./api";

describe("web api", () => {
  it("exposes namespaced groups and the shared APIError", () => {
    expect(typeof api.boards.listBoards).toBe("function");
    expect(typeof api.public.getMatches).toBe("function");
    expect(APIError).toBeTypeOf("function");
  });
});
