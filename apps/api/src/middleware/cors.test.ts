import { describe, expect, it } from "vitest";
import { corsMiddleware } from "./cors";

describe("corsMiddleware", () => {
  it("is defined", () => {
    expect(corsMiddleware).toBeDefined();
  });

  it("is a middleware function", () => {
    expect(typeof corsMiddleware).toBe("function");
  });
});
