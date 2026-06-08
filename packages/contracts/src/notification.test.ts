import { describe, expect, it } from "vitest";
import {
  notificationIdParamSchema,
  notificationListQuerySchema,
  notificationUserIdQuerySchema,
  notificationPreferencesBodySchema,
} from "./notification";

describe("notificationIdParamSchema", () => {
  it("coerces string id to positive integer", () => {
    expect(notificationIdParamSchema.parse({ id: "5" })).toEqual({ id: 5 });
  });

  it("rejects zero", () => {
    expect(() => notificationIdParamSchema.parse({ id: 0 })).toThrow();
  });

  it("rejects negative numbers", () => {
    expect(() => notificationIdParamSchema.parse({ id: -1 })).toThrow();
  });

  it("rejects non-numeric strings", () => {
    expect(() => notificationIdParamSchema.parse({ id: "abc" })).toThrow();
  });
});

describe("notificationListQuerySchema", () => {
  it("accepts empty object (userId is optional)", () => {
    expect(notificationListQuerySchema.parse({})).toEqual({});
  });

  it("rejects empty userId string", () => {
    expect(() =>
      notificationListQuerySchema.parse({ userId: "" }),
    ).toThrow();
  });

  it("accepts userId only", () => {
    expect(
      notificationListQuerySchema.parse({ userId: "user-1" }),
    ).toEqual({ userId: "user-1" });
  });

  it("accepts limit and offset", () => {
    expect(
      notificationListQuerySchema.parse({
        userId: "user-1",
        limit: "10",
        offset: "5",
      }),
    ).toEqual({ userId: "user-1", limit: 10, offset: 5 });
  });

  it("coerces string limit and offset", () => {
    expect(
      notificationListQuerySchema.parse({
        userId: "user-1",
        limit: "50",
        offset: "0",
      }),
    ).toEqual({ userId: "user-1", limit: 50, offset: 0 });
  });

  it("rejects limit exceeding 100", () => {
    expect(() =>
      notificationListQuerySchema.parse({ userId: "user-1", limit: 101 }),
    ).toThrow();
  });

  it("rejects zero limit", () => {
    expect(() =>
      notificationListQuerySchema.parse({ userId: "user-1", limit: 0 }),
    ).toThrow();
  });

  it("rejects negative offset", () => {
    expect(() =>
      notificationListQuerySchema.parse({ userId: "user-1", offset: -1 }),
    ).toThrow();
  });

  it("accepts offset of zero", () => {
    expect(
      notificationListQuerySchema.parse({ userId: "user-1", offset: 0 }),
    ).toEqual({ userId: "user-1", offset: 0 });
  });
});

describe("notificationUserIdQuerySchema", () => {
  it("requires userId", () => {
    expect(() => notificationUserIdQuerySchema.parse({})).toThrow();
  });

  it("rejects empty userId", () => {
    expect(() =>
      notificationUserIdQuerySchema.parse({ userId: "" }),
    ).toThrow();
  });

  it("accepts valid userId", () => {
    expect(
      notificationUserIdQuerySchema.parse({ userId: "user-1" }),
    ).toEqual({ userId: "user-1" });
  });
});

describe("notificationPreferencesBodySchema", () => {
  it("accepts empty object (all fields optional)", () => {
    expect(notificationPreferencesBodySchema.parse({})).toEqual({});
  });

  it("accepts mutedEventTypes array", () => {
    expect(
      notificationPreferencesBodySchema.parse({
        mutedEventTypes: ["task.assigned", "match.updated"],
      }),
    ).toEqual({ mutedEventTypes: ["task.assigned", "match.updated"] });
  });

  it("accepts empty mutedEventTypes array", () => {
    expect(
      notificationPreferencesBodySchema.parse({ mutedEventTypes: [] }),
    ).toEqual({ mutedEventTypes: [] });
  });

  it("accepts locale de", () => {
    expect(notificationPreferencesBodySchema.parse({ locale: "de" })).toEqual({
      locale: "de",
    });
  });

  it("accepts locale en", () => {
    expect(notificationPreferencesBodySchema.parse({ locale: "en" })).toEqual({
      locale: "en",
    });
  });

  it("rejects invalid locale", () => {
    expect(() =>
      notificationPreferencesBodySchema.parse({ locale: "fr" }),
    ).toThrow();
  });

  it("accepts both mutedEventTypes and locale together", () => {
    const input = { mutedEventTypes: ["task.assigned"], locale: "en" as const };
    expect(notificationPreferencesBodySchema.parse(input)).toEqual(input);
  });
});
