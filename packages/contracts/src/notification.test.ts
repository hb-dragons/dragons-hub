import { describe, expect, it } from "vitest";
import { USER_TOGGLEABLE_EVENT_TYPES } from "@dragons/shared";
import {
  notificationIdParamSchema,
  notificationListQuerySchema,
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
  it("accepts empty object (limit and offset are optional)", () => {
    expect(notificationListQuerySchema.parse({})).toEqual({});
  });

  it("strips userId so it can never reach the handler (issue #123)", () => {
    expect(
      notificationListQuerySchema.parse({ userId: "someone-else", limit: "10" }),
    ).toEqual({ limit: 10 });
  });

  it("accepts limit and offset", () => {
    expect(
      notificationListQuerySchema.parse({
        limit: "10",
        offset: "5",
      }),
    ).toEqual({ limit: 10, offset: 5 });
  });

  it("coerces string limit and offset", () => {
    expect(
      notificationListQuerySchema.parse({
        limit: "50",
        offset: "0",
      }),
    ).toEqual({ limit: 50, offset: 0 });
  });

  it("rejects limit exceeding 100", () => {
    expect(() => notificationListQuerySchema.parse({ limit: 101 })).toThrow();
  });

  it("rejects zero limit", () => {
    expect(() => notificationListQuerySchema.parse({ limit: 0 })).toThrow();
  });

  it("rejects negative offset", () => {
    expect(() => notificationListQuerySchema.parse({ offset: -1 })).toThrow();
  });

  it("accepts offset of zero", () => {
    expect(notificationListQuerySchema.parse({ offset: 0 })).toEqual({
      offset: 0,
    });
  });
});

describe("notificationPreferencesBodySchema", () => {
  it("accepts empty object (all fields optional)", () => {
    expect(notificationPreferencesBodySchema.parse({})).toEqual({});
  });

  it("accepts mutedEventTypes array", () => {
    expect(
      notificationPreferencesBodySchema.parse({
        mutedEventTypes: ["task.assigned", "task.due.reminder"],
      }),
    ).toEqual({ mutedEventTypes: ["task.assigned", "task.due.reminder"] });
  });

  it.each(USER_TOGGLEABLE_EVENT_TYPES)("accepts the toggleable type %s", (eventType) => {
    const result = notificationPreferencesBodySchema.safeParse({
      mutedEventTypes: [eventType],
    });
    expect(result.error?.issues ?? []).toEqual([]);
  });

  // Muting a type the user cannot toggle silences nothing, so it is a typo
  // rather than an intent. Enumerated here rather than in the service, so the
  // rejection is the central 400 and not a message-matched catch in the route.
  it("rejects an event type that is not user-toggleable", () => {
    expect(() =>
      notificationPreferencesBodySchema.parse({ mutedEventTypes: ["match.created"] }),
    ).toThrow();
  });

  it("rejects an event type that is in no registry at all", () => {
    expect(() =>
      notificationPreferencesBodySchema.parse({ mutedEventTypes: ["bogus.event"] }),
    ).toThrow();
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
