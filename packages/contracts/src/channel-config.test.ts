import { describe, expect, it } from "vitest";
import {
  channelConfigIdParamSchema,
  channelConfigListQuerySchema,
  createChannelConfigSchema,
  updateChannelConfigSchema,
  validateConfigForType,
} from "./channel-config";

describe("createChannelConfigSchema", () => {
  const base = { name: "Test Channel" };

  it("accepts in_app with audienceRole admin and locale de", () => {
    const result = createChannelConfigSchema.safeParse({
      ...base,
      type: "in_app",
      config: { audienceRole: "admin", locale: "de" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts in_app with audienceRole referee and locale en", () => {
    const result = createChannelConfigSchema.safeParse({
      ...base,
      type: "in_app",
      config: { audienceRole: "referee", locale: "en" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts whatsapp_group with groupId and locale", () => {
    const result = createChannelConfigSchema.safeParse({
      ...base,
      type: "whatsapp_group",
      config: { groupId: "123", locale: "de" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts email with locale", () => {
    const result = createChannelConfigSchema.safeParse({
      ...base,
      type: "email",
      config: { locale: "de" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects type push (removed from enum)", () => {
    const result = createChannelConfigSchema.safeParse({
      ...base,
      type: "push",
      config: { locale: "de" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects in_app with whatsapp_group config shape", () => {
    const result = createChannelConfigSchema.safeParse({
      ...base,
      type: "in_app",
      config: { groupId: "123", locale: "de" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects whatsapp_group with in_app config shape", () => {
    const result = createChannelConfigSchema.safeParse({
      ...base,
      type: "whatsapp_group",
      config: { audienceRole: "admin", locale: "de" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing config on create", () => {
    const result = createChannelConfigSchema.safeParse({
      ...base,
      type: "in_app",
    });
    expect(result.success).toBe(false);
  });
});

describe("channelConfigIdParamSchema", () => {
  it("coerces string id to positive integer", () => {
    expect(channelConfigIdParamSchema.parse({ id: "5" })).toEqual({ id: 5 });
  });

  it("rejects zero", () => {
    expect(() => channelConfigIdParamSchema.parse({ id: 0 })).toThrow();
  });

  it("rejects negative numbers", () => {
    expect(() => channelConfigIdParamSchema.parse({ id: -1 })).toThrow();
  });

  it("rejects non-numeric strings", () => {
    expect(() => channelConfigIdParamSchema.parse({ id: "abc" })).toThrow();
  });
});

describe("channelConfigListQuerySchema", () => {
  it("accepts empty query", () => {
    expect(channelConfigListQuerySchema.parse({})).toEqual({});
  });

  it("coerces string page to number", () => {
    expect(channelConfigListQuerySchema.parse({ page: "2" })).toEqual({ page: 2 });
  });

  it("coerces string limit to number", () => {
    expect(channelConfigListQuerySchema.parse({ limit: "50" })).toEqual({ limit: 50 });
  });

  it("rejects page of zero", () => {
    expect(() => channelConfigListQuerySchema.parse({ page: 0 })).toThrow();
  });

  it("rejects limit exceeding 100", () => {
    expect(() => channelConfigListQuerySchema.parse({ limit: 101 })).toThrow();
  });

  it("rejects negative limit", () => {
    expect(() => channelConfigListQuerySchema.parse({ limit: -1 })).toThrow();
  });
});

describe("updateChannelConfigSchema", () => {
  it("accepts empty object", () => {
    expect(updateChannelConfigSchema.parse({})).toEqual({});
  });

  it("accepts name update", () => {
    expect(updateChannelConfigSchema.parse({ name: "New Name" })).toEqual({ name: "New Name" });
  });

  it("rejects empty string name", () => {
    expect(() => updateChannelConfigSchema.parse({ name: "" })).toThrow();
  });

  it("accepts enabled boolean", () => {
    expect(updateChannelConfigSchema.parse({ enabled: false })).toEqual({ enabled: false });
  });

  it("accepts config record", () => {
    expect(
      updateChannelConfigSchema.parse({ config: { audienceRole: "admin", locale: "de" } }),
    ).toEqual({ config: { audienceRole: "admin", locale: "de" } });
  });

  it("accepts valid digestMode", () => {
    expect(updateChannelConfigSchema.parse({ digestMode: "scheduled" })).toEqual({
      digestMode: "scheduled",
    });
  });

  it("rejects invalid digestMode", () => {
    expect(() => updateChannelConfigSchema.parse({ digestMode: "daily" })).toThrow();
  });

  it("accepts null digestCron", () => {
    expect(updateChannelConfigSchema.parse({ digestCron: null })).toEqual({ digestCron: null });
  });

  it("accepts digestTimezone", () => {
    expect(updateChannelConfigSchema.parse({ digestTimezone: "Europe/Berlin" })).toEqual({
      digestTimezone: "Europe/Berlin",
    });
  });
});

describe("validateConfigForType", () => {
  it("returns validated config for matching type and config", () => {
    const result = validateConfigForType("in_app", {
      audienceRole: "admin",
      locale: "de",
    });
    expect(result).toEqual({ audienceRole: "admin", locale: "de" });
  });

  it("returns null for mismatched type and config", () => {
    const result = validateConfigForType("in_app", {
      groupId: "123",
      locale: "de",
    });
    expect(result).toBeNull();
  });

  it("returns null for unknown type like push", () => {
    const result = validateConfigForType("push", { locale: "de" });
    expect(result).toBeNull();
  });
});
