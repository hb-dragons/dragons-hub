import { describe, expect, it } from "vitest";
import { notificationTestSendBodySchema } from "./notification-test";

describe("notificationTestSendBodySchema", () => {
  it("parses empty object (no message)", () => {
    const result = notificationTestSendBodySchema.parse({});
    expect(result).toEqual({});
  });

  it("parses with undefined message", () => {
    const result = notificationTestSendBodySchema.parse({ message: undefined });
    expect(result).toEqual({});
  });

  it("parses a valid message", () => {
    const result = notificationTestSendBodySchema.parse({ message: "Hello Dragons!" });
    expect(result).toEqual({ message: "Hello Dragons!" });
  });

  it("parses a message at the max length (180 chars)", () => {
    const msg = "a".repeat(180);
    const result = notificationTestSendBodySchema.parse({ message: msg });
    expect(result.message).toHaveLength(180);
  });

  it("rejects an empty string message", () => {
    expect(() => notificationTestSendBodySchema.parse({ message: "" })).toThrow();
  });

  it("rejects a message exceeding 180 chars", () => {
    const msg = "a".repeat(181);
    expect(() => notificationTestSendBodySchema.parse({ message: msg })).toThrow();
  });

  it("rejects a non-string message", () => {
    expect(() => notificationTestSendBodySchema.parse({ message: 42 })).toThrow();
  });
});
