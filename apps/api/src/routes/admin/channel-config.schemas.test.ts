import { describe, expect, it } from "vitest";
import {
  createChannelConfigSchema,
  validateConfigForType,
} from "./channel-config.schemas.js";

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
