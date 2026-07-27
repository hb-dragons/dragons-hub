import { describe, expect, it } from "vitest";
import { unsubscribeQuerySchema } from "./unsubscribe";

describe("unsubscribeQuerySchema", () => {
  it("parses a token and defaults the locale to German", () => {
    expect(unsubscribeQuerySchema.parse({ token: "abc" })).toEqual({
      token: "abc",
      locale: "de",
    });
  });

  it("keeps an explicit supported locale", () => {
    expect(unsubscribeQuerySchema.parse({ token: "abc", locale: "en" })).toEqual({
      token: "abc",
      locale: "en",
    });
  });

  // A junk locale must not turn a working unsubscribe link into a 400.
  it("falls back to German for an unsupported locale", () => {
    expect(unsubscribeQuerySchema.parse({ token: "abc", locale: "fr" })).toEqual({
      token: "abc",
      locale: "de",
    });
  });

  it("accepts a real 43-character base64url token", () => {
    const token = "a".repeat(43);
    expect(unsubscribeQuerySchema.parse({ token }).token).toBe(token);
  });

  // Anything that could plausibly be a token reaches the handler, which
  // answers with a readable page rather than the central JSON 400.
  it("accepts a token that is merely wrong, not malformed", () => {
    expect(unsubscribeQuerySchema.parse({ token: "not-a-real-token" }).token).toBe(
      "not-a-real-token",
    );
  });

  it("rejects a missing token", () => {
    expect(unsubscribeQuerySchema.safeParse({}).success).toBe(false);
  });

  it("rejects an empty token", () => {
    expect(unsubscribeQuerySchema.safeParse({ token: "" }).success).toBe(false);
  });

  it("rejects a token longer than 200 characters", () => {
    expect(unsubscribeQuerySchema.safeParse({ token: "a".repeat(201) }).success).toBe(
      false,
    );
  });
});
