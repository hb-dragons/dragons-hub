import { describe, expect, it, vi } from "vitest";

vi.mock("../config/env", () => ({
  env: {
    TRUSTED_ORIGINS: ["http://localhost:3000"],
  },
}));

// Import after mock
import { corsMiddleware } from "./cors";

describe("corsMiddleware", () => {
  it("is defined", () => {
    expect(corsMiddleware).toBeDefined();
  });

  it("is a middleware function", () => {
    expect(typeof corsMiddleware).toBe("function");
  });
});
