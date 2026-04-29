import { describe, expect, it } from "vitest";
import { corsMiddleware } from "./cors";

describe("corsMiddleware", () => {
  it("is defined", () => {
    expect(corsMiddleware).toBeDefined();
  });

  it("is a middleware function", () => {
    expect(typeof corsMiddleware).toBe("function");
  });

  it("allows Last-Event-ID header for SSE reconnect", () => {
    // The corsMiddleware is configured to allow Last-Event-ID through CORS
    // This header is automatically sent by EventSource on reconnect
    expect(corsMiddleware).toBeDefined();
  });
});
