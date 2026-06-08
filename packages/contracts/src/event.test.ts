import { describe, expect, it } from "vitest";
import { eventListQuerySchema, triggerEventSchema } from "./event";

describe("eventListQuerySchema", () => {
  it("parses empty input with no defaults", () => {
    const result = eventListQuerySchema.parse({});
    expect(result).toEqual({});
  });

  it("coerces string page to positive integer", () => {
    const result = eventListQuerySchema.parse({ page: "2" });
    expect(result).toMatchObject({ page: 2 });
  });

  it("coerces string limit to positive integer", () => {
    const result = eventListQuerySchema.parse({ limit: "50" });
    expect(result).toMatchObject({ limit: 50 });
  });

  it("accepts limit at max boundary (100)", () => {
    const result = eventListQuerySchema.parse({ limit: "100" });
    expect(result).toMatchObject({ limit: 100 });
  });

  it("accepts optional string fields", () => {
    const result = eventListQuerySchema.parse({
      type: "match.created",
      entityType: "match",
      source: "sync",
      from: "2026-01-01",
      to: "2026-12-31",
      search: "Dragons",
    });
    expect(result).toMatchObject({
      type: "match.created",
      entityType: "match",
      source: "sync",
      from: "2026-01-01",
      to: "2026-12-31",
      search: "Dragons",
    });
  });

  it("accepts valid status enum values", () => {
    for (const status of ["pending", "sent", "failed", "read"] as const) {
      expect(eventListQuerySchema.parse({ status })).toMatchObject({ status });
    }
  });

  it("accepts search at exactly 200 chars", () => {
    const search = "a".repeat(200);
    const result = eventListQuerySchema.parse({ search });
    expect(result).toMatchObject({ search });
  });

  it("rejects limit above 100", () => {
    expect(() => eventListQuerySchema.parse({ limit: "101" })).toThrow();
  });

  it("rejects page of zero", () => {
    expect(() => eventListQuerySchema.parse({ page: "0" })).toThrow();
  });

  it("rejects negative page", () => {
    expect(() => eventListQuerySchema.parse({ page: "-1" })).toThrow();
  });

  it("rejects negative limit", () => {
    expect(() => eventListQuerySchema.parse({ limit: "-1" })).toThrow();
  });

  it("rejects invalid status value", () => {
    expect(() => eventListQuerySchema.parse({ status: "unknown" })).toThrow();
  });

  it("rejects search exceeding 200 chars", () => {
    expect(() => eventListQuerySchema.parse({ search: "a".repeat(201) })).toThrow();
  });

  it("rejects non-numeric page string", () => {
    expect(() => eventListQuerySchema.parse({ page: "abc" })).toThrow();
  });
});

describe("triggerEventSchema", () => {
  const validBody = {
    type: "match.cancelled",
    entityType: "match" as const,
    entityId: 42,
    entityName: "Dragons vs. Tigers",
    deepLinkPath: "/admin/matches/42",
  };

  it("accepts a valid full body", () => {
    const result = triggerEventSchema.parse({
      ...validBody,
      payload: { reason: "weather" },
      urgencyOverride: "immediate",
    });
    expect(result).toMatchObject({
      ...validBody,
      payload: { reason: "weather" },
      urgencyOverride: "immediate",
    });
  });

  it("defaults payload to empty object when omitted", () => {
    const result = triggerEventSchema.parse(validBody);
    expect(result.payload).toEqual({});
  });

  it("accepts all valid entityType values", () => {
    for (const entityType of ["match", "booking", "referee"] as const) {
      const result = triggerEventSchema.parse({ ...validBody, entityType });
      expect(result).toMatchObject({ entityType });
    }
  });

  it("accepts all valid urgencyOverride values", () => {
    for (const urgencyOverride of ["immediate", "routine"] as const) {
      const result = triggerEventSchema.parse({ ...validBody, urgencyOverride });
      expect(result).toMatchObject({ urgencyOverride });
    }
  });

  it("omits urgencyOverride when not provided", () => {
    const result = triggerEventSchema.parse(validBody);
    expect(result.urgencyOverride).toBeUndefined();
  });

  it("accepts entityName at max length (300)", () => {
    const result = triggerEventSchema.parse({ ...validBody, entityName: "x".repeat(300) });
    expect(result.entityName).toHaveLength(300);
  });

  it("accepts deepLinkPath at max length (500)", () => {
    const result = triggerEventSchema.parse({ ...validBody, deepLinkPath: "/".padEnd(500, "x") });
    expect(result.deepLinkPath).toHaveLength(500);
  });

  it("accepts type at max length (100)", () => {
    const result = triggerEventSchema.parse({ ...validBody, type: "a".repeat(100) });
    expect(result.type).toHaveLength(100);
  });

  it("rejects missing type", () => {
    const { type: _type, ...rest } = validBody;
    expect(() => triggerEventSchema.parse(rest)).toThrow();
  });

  it("rejects empty type string", () => {
    expect(() => triggerEventSchema.parse({ ...validBody, type: "" })).toThrow();
  });

  it("rejects type exceeding 100 chars", () => {
    expect(() => triggerEventSchema.parse({ ...validBody, type: "a".repeat(101) })).toThrow();
  });

  it("rejects invalid entityType", () => {
    expect(() => triggerEventSchema.parse({ ...validBody, entityType: "league" })).toThrow();
  });

  it("rejects missing entityType", () => {
    const { entityType: _et, ...rest } = validBody;
    expect(() => triggerEventSchema.parse(rest)).toThrow();
  });

  it("rejects zero entityId", () => {
    expect(() => triggerEventSchema.parse({ ...validBody, entityId: 0 })).toThrow();
  });

  it("rejects negative entityId", () => {
    expect(() => triggerEventSchema.parse({ ...validBody, entityId: -1 })).toThrow();
  });

  it("rejects missing entityId", () => {
    const { entityId: _ei, ...rest } = validBody;
    expect(() => triggerEventSchema.parse(rest)).toThrow();
  });

  it("rejects empty entityName", () => {
    expect(() => triggerEventSchema.parse({ ...validBody, entityName: "" })).toThrow();
  });

  it("rejects entityName exceeding 300 chars", () => {
    expect(() =>
      triggerEventSchema.parse({ ...validBody, entityName: "x".repeat(301) }),
    ).toThrow();
  });

  it("rejects empty deepLinkPath", () => {
    expect(() => triggerEventSchema.parse({ ...validBody, deepLinkPath: "" })).toThrow();
  });

  it("rejects deepLinkPath exceeding 500 chars", () => {
    expect(() =>
      triggerEventSchema.parse({ ...validBody, deepLinkPath: "x".repeat(501) }),
    ).toThrow();
  });

  it("rejects invalid urgencyOverride value", () => {
    expect(() =>
      triggerEventSchema.parse({ ...validBody, urgencyOverride: "urgent" }),
    ).toThrow();
  });
});
