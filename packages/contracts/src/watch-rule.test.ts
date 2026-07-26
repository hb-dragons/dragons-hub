import { describe, expect, it } from "vitest";
import { CHANNEL_TYPES, EVENT_TYPE_VALUES, EVENT_URGENCIES } from "@dragons/shared";
import {
  watchRuleIdParamSchema,
  watchRuleListQuerySchema,
  createWatchRuleSchema,
  updateWatchRuleSchema,
} from "./watch-rule";
import { CHANNEL_TYPES } from "@dragons/shared";

describe("watchRuleIdParamSchema", () => {
  it("coerces string id to positive integer", () => {
    expect(watchRuleIdParamSchema.parse({ id: "5" })).toEqual({ id: 5 });
  });

  it("accepts numeric id directly", () => {
    expect(watchRuleIdParamSchema.parse({ id: 10 })).toEqual({ id: 10 });
  });

  it("rejects zero", () => {
    expect(() => watchRuleIdParamSchema.parse({ id: 0 })).toThrow();
  });

  it("rejects negative id", () => {
    expect(() => watchRuleIdParamSchema.parse({ id: -1 })).toThrow();
  });

  it("rejects non-numeric string", () => {
    expect(() => watchRuleIdParamSchema.parse({ id: "abc" })).toThrow();
  });
});

describe("watchRuleListQuerySchema", () => {
  it("parses empty input with all fields optional", () => {
    const result = watchRuleListQuerySchema.parse({});
    expect(result).toEqual({});
  });

  it("coerces string page and limit", () => {
    const result = watchRuleListQuerySchema.parse({ page: "2", limit: "10" });
    expect(result).toEqual({ page: 2, limit: 10 });
  });

  it("accepts limit at max boundary", () => {
    const result = watchRuleListQuerySchema.parse({ limit: "100" });
    expect(result).toMatchObject({ limit: 100 });
  });

  it("rejects limit above 100", () => {
    expect(() => watchRuleListQuerySchema.parse({ limit: "101" })).toThrow();
  });

  it("rejects page of zero", () => {
    expect(() => watchRuleListQuerySchema.parse({ page: "0" })).toThrow();
  });

  it("rejects negative page", () => {
    expect(() => watchRuleListQuerySchema.parse({ page: "-1" })).toThrow();
  });

  it("rejects negative limit", () => {
    expect(() => watchRuleListQuerySchema.parse({ limit: "-1" })).toThrow();
  });

  it("rejects non-numeric page string", () => {
    expect(() => watchRuleListQuerySchema.parse({ page: "abc" })).toThrow();
  });
});

describe("createWatchRuleSchema", () => {
  const validBody = {
    name: "Match changes",
    eventTypes: ["match.schedule.changed"],
    channels: [{ channel: "in_app", targetId: "1" }],
  };

  it("accepts minimal valid body", () => {
    const result = createWatchRuleSchema.parse(validBody);
    expect(result).toMatchObject(validBody);
  });

  it("accepts all optional fields", () => {
    const body = {
      ...validBody,
      enabled: false,
      filters: [{ field: "teamId", operator: "eq", value: "42" }],
      urgencyOverride: "immediate",
      templateOverride: "match-change",
    };
    const result = createWatchRuleSchema.parse(body);
    expect(result).toMatchObject(body);
  });

  it("accepts null urgencyOverride and templateOverride", () => {
    const result = createWatchRuleSchema.parse({
      ...validBody,
      urgencyOverride: null,
      templateOverride: null,
    });
    expect(result.urgencyOverride).toBeNull();
    expect(result.templateOverride).toBeNull();
  });

  it("accepts multiple eventTypes", () => {
    const result = createWatchRuleSchema.parse({
      ...validBody,
      eventTypes: ["match.created", "match.score.changed"],
    });
    expect(result.eventTypes).toHaveLength(2);
  });

  it("accepts multiple channels", () => {
    const result = createWatchRuleSchema.parse({
      ...validBody,
      channels: [
        { channel: "in_app", targetId: "1" },
        { channel: "push", targetId: "device-token" },
      ],
    });
    expect(result.channels).toHaveLength(2);
  });

  // Derived from CHANNEL_TYPES rather than restated, so a channel target can
  // never address a channel the pipeline has no adapter for.
  it.each(CHANNEL_TYPES)("accepts the shared channel type %s", (channel) => {
    const result = createWatchRuleSchema.parse({
      ...validBody,
      channels: [{ channel, targetId: "1" }],
    });
    expect(result.channels[0]!.channel).toBe(channel);
  });

  it("rejects an email channel target (no adapter exists)", () => {
    const result = createWatchRuleSchema.safeParse({
      ...validBody,
      channels: [{ channel: "email", targetId: "1" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid filter fields", () => {
    for (const field of ["teamId", "leagueId", "venueId", "source"] as const) {
      const result = createWatchRuleSchema.parse({
        ...validBody,
        filters: [{ field, operator: "eq", value: "1" }],
      });
      expect(result.filters![0]!.field).toBe(field);
    }
  });

  it("accepts all valid filter operators", () => {
    for (const operator of ["eq", "neq", "in", "any"] as const) {
      const result = createWatchRuleSchema.parse({
        ...validBody,
        filters: [{ field: "teamId", operator, value: "1" }],
      });
      expect(result.filters![0]!.operator).toBe(operator);
    }
  });

  it("accepts filter with array value", () => {
    const result = createWatchRuleSchema.parse({
      ...validBody,
      filters: [{ field: "teamId", operator: "in", value: ["1", "2", "3"] }],
    });
    expect(result.filters![0]!.value).toEqual(["1", "2", "3"]);
  });

  it("accepts filter with null value", () => {
    const result = createWatchRuleSchema.parse({
      ...validBody,
      filters: [{ field: "teamId", operator: "any", value: null }],
    });
    expect(result.filters![0]!.value).toBeNull();
  });

  it("rejects missing name", () => {
    expect(() =>
      createWatchRuleSchema.parse({
        eventTypes: ["match.created"],
        channels: [{ channel: "in_app", targetId: "1" }],
      }),
    ).toThrow();
  });

  it("rejects empty name", () => {
    expect(() =>
      createWatchRuleSchema.parse({ ...validBody, name: "" }),
    ).toThrow();
  });

  it("rejects missing eventTypes", () => {
    expect(() =>
      createWatchRuleSchema.parse({
        name: "Test",
        channels: [{ channel: "in_app", targetId: "1" }],
      }),
    ).toThrow();
  });

  it("rejects empty eventTypes array", () => {
    expect(() =>
      createWatchRuleSchema.parse({ ...validBody, eventTypes: [] }),
    ).toThrow();
  });

  it("rejects eventTypes with empty string", () => {
    expect(() =>
      createWatchRuleSchema.parse({ ...validBody, eventTypes: [""] }),
    ).toThrow();
  });

  // A typo'd event type used to save cleanly into a rule that could then never
  // match anything.
  it("rejects an event type that is not in the shared EVENT_TYPES registry", () => {
    expect(() =>
      createWatchRuleSchema.parse({ ...validBody, eventTypes: ["match.scheduled"] }),
    ).toThrow();
  });

  it.each(EVENT_TYPE_VALUES)("accepts the shared event type %s", (eventType) => {
    const result = createWatchRuleSchema.safeParse({ ...validBody, eventTypes: [eventType] });
    expect(result.error?.issues ?? []).toEqual([]);
  });

  it.each(CHANNEL_TYPES)("accepts the shared channel type %s as a target", (channel) => {
    const result = createWatchRuleSchema.safeParse({
      ...validBody,
      channels: [{ channel, targetId: "1" }],
    });
    expect(result.error?.issues ?? []).toEqual([]);
  });

  it.each(EVENT_URGENCIES)("accepts the shared urgency %s", (urgency) => {
    const result = createWatchRuleSchema.safeParse({ ...validBody, urgencyOverride: urgency });
    expect(result.error?.issues ?? []).toEqual([]);
  });

  it("rejects an urgencyOverride outside the shared list", () => {
    expect(() =>
      createWatchRuleSchema.parse({ ...validBody, urgencyOverride: "high" }),
    ).toThrow();
  });

  it("rejects a key the schema does not declare", () => {
    expect(() => createWatchRuleSchema.parse({ ...validBody, enable: true })).toThrow();
  });

  it("rejects missing channels", () => {
    expect(() =>
      createWatchRuleSchema.parse({
        name: "Test",
        eventTypes: ["match.created"],
      }),
    ).toThrow();
  });

  it("rejects empty channels array", () => {
    expect(() =>
      createWatchRuleSchema.parse({ ...validBody, channels: [] }),
    ).toThrow();
  });

  it("rejects channel with empty targetId", () => {
    expect(() =>
      createWatchRuleSchema.parse({
        ...validBody,
        channels: [{ channel: "in_app", targetId: "" }],
      }),
    ).toThrow();
  });

  it("rejects invalid channel type", () => {
    expect(() =>
      createWatchRuleSchema.parse({
        ...validBody,
        channels: [{ channel: "sms", targetId: "1" }],
      }),
    ).toThrow();
  });

  it("rejects invalid filter field", () => {
    expect(() =>
      createWatchRuleSchema.parse({
        ...validBody,
        filters: [{ field: "unknownField", operator: "eq", value: "1" }],
      }),
    ).toThrow();
  });

  it("rejects invalid filter operator", () => {
    expect(() =>
      createWatchRuleSchema.parse({
        ...validBody,
        filters: [{ field: "teamId", operator: "contains", value: "1" }],
      }),
    ).toThrow();
  });
});

describe("updateWatchRuleSchema", () => {
  it("accepts empty object (all fields optional)", () => {
    const result = updateWatchRuleSchema.parse({});
    expect(result).toEqual({});
  });

  it("accepts partial update with only name", () => {
    const result = updateWatchRuleSchema.parse({ name: "New name" });
    expect(result).toMatchObject({ name: "New name" });
  });

  it("accepts partial update with only enabled", () => {
    const result = updateWatchRuleSchema.parse({ enabled: false });
    expect(result).toMatchObject({ enabled: false });
  });

  it("accepts updating eventTypes", () => {
    const result = updateWatchRuleSchema.parse({
      eventTypes: ["match.score.changed"],
    });
    expect(result.eventTypes).toEqual(["match.score.changed"]);
  });

  it("accepts updating channels", () => {
    const result = updateWatchRuleSchema.parse({
      channels: [{ channel: "push", targetId: "device-123" }],
    });
    expect(result.channels![0]!).toMatchObject({ channel: "push" });
  });

  it("accepts updating filters", () => {
    const result = updateWatchRuleSchema.parse({
      filters: [{ field: "leagueId", operator: "neq", value: "5" }],
    });
    expect(result.filters![0]!).toMatchObject({ field: "leagueId" });
  });

  it("accepts null urgencyOverride to clear", () => {
    const result = updateWatchRuleSchema.parse({ urgencyOverride: null });
    expect(result.urgencyOverride).toBeNull();
  });

  it("accepts null templateOverride to clear", () => {
    const result = updateWatchRuleSchema.parse({ templateOverride: null });
    expect(result.templateOverride).toBeNull();
  });

  it("rejects empty name", () => {
    expect(() => updateWatchRuleSchema.parse({ name: "" })).toThrow();
  });

  it("rejects empty eventTypes array", () => {
    expect(() => updateWatchRuleSchema.parse({ eventTypes: [] })).toThrow();
  });

  it("rejects empty channels array", () => {
    expect(() => updateWatchRuleSchema.parse({ channels: [] })).toThrow();
  });

  it("rejects channel with empty targetId", () => {
    expect(() =>
      updateWatchRuleSchema.parse({
        channels: [{ channel: "push", targetId: "" }],
      }),
    ).toThrow();
  });

  it("rejects invalid channel type", () => {
    expect(() =>
      updateWatchRuleSchema.parse({
        channels: [{ channel: "sms", targetId: "1" }],
      }),
    ).toThrow();
  });
});
