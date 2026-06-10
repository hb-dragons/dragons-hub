import { describe, expect, it } from "vitest";
import { deviceRegisterBodySchema } from "./devices";

describe("deviceRegisterBodySchema", () => {
  it("parses valid ios registration with locale", () => {
    const result = deviceRegisterBodySchema.parse({
      token: "fcm-abc",
      platform: "ios",
      locale: "de-DE",
    });
    expect(result).toEqual({ token: "fcm-abc", platform: "ios", locale: "de-DE" });
  });

  it("parses valid android registration without locale", () => {
    const result = deviceRegisterBodySchema.parse({
      token: "fcm-xyz",
      platform: "android",
    });
    expect(result).toEqual({ token: "fcm-xyz", platform: "android" });
  });

  it("parses valid ios registration without locale (locale optional)", () => {
    const result = deviceRegisterBodySchema.parse({
      token: "ExponentPushToken[abc]",
      platform: "ios",
    });
    expect(result).toMatchObject({ token: "ExponentPushToken[abc]", platform: "ios" });
    expect(result.locale).toBeUndefined();
  });

  it("parses locale at minimum length (2 chars)", () => {
    const result = deviceRegisterBodySchema.parse({
      token: "tok",
      platform: "android",
      locale: "de",
    });
    expect(result.locale).toBe("de");
  });

  it("parses locale at maximum length (15 chars)", () => {
    const result = deviceRegisterBodySchema.parse({
      token: "tok",
      platform: "ios",
      locale: "en-US-extended",
    });
    expect(result.locale).toBe("en-US-extended");
  });

  it("rejects missing token", () => {
    expect(() =>
      deviceRegisterBodySchema.parse({ platform: "ios" }),
    ).toThrow();
  });

  it("rejects empty token", () => {
    expect(() =>
      deviceRegisterBodySchema.parse({ token: "", platform: "ios" }),
    ).toThrow();
  });

  it("rejects missing platform", () => {
    expect(() =>
      deviceRegisterBodySchema.parse({ token: "fcm-abc" }),
    ).toThrow();
  });

  it("rejects invalid platform enum", () => {
    expect(() =>
      deviceRegisterBodySchema.parse({ token: "fcm-abc", platform: "windows" }),
    ).toThrow();
  });

  it("rejects locale shorter than 2 chars", () => {
    expect(() =>
      deviceRegisterBodySchema.parse({ token: "fcm-abc", platform: "ios", locale: "a" }),
    ).toThrow();
  });

  it("rejects locale longer than 15 chars", () => {
    expect(() =>
      deviceRegisterBodySchema.parse({
        token: "fcm-abc",
        platform: "ios",
        locale: "en-US-too-long-x",
      }),
    ).toThrow();
  });

  it("rejects empty body", () => {
    expect(() => deviceRegisterBodySchema.parse({})).toThrow();
  });
});
