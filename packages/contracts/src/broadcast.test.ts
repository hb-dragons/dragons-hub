import { describe, expect, it } from "vitest";
import {
  broadcastUpsertSchema,
  broadcastStartStopSchema,
  broadcastMatchesQuerySchema,
} from "./broadcast";

describe("broadcastUpsertSchema", () => {
  it("accepts minimal valid input with just deviceId", () => {
    const result = broadcastUpsertSchema.parse({ deviceId: "dev1" });
    expect(result).toMatchObject({ deviceId: "dev1" });
  });

  it("accepts full valid input", () => {
    const result = broadcastUpsertSchema.parse({
      deviceId: "dev1",
      matchId: 42,
      homeAbbr: "DRA",
      guestAbbr: "VIS",
      homeColorOverride: "#ff0000",
      guestColorOverride: "#0000ff",
    });
    expect(result).toMatchObject({
      deviceId: "dev1",
      matchId: 42,
      homeAbbr: "DRA",
      guestAbbr: "VIS",
      homeColorOverride: "#ff0000",
      guestColorOverride: "#0000ff",
    });
  });

  it("accepts null nullable-optional fields", () => {
    const result = broadcastUpsertSchema.parse({
      deviceId: "dev1",
      matchId: null,
      homeAbbr: null,
      guestAbbr: null,
      homeColorOverride: null,
      guestColorOverride: null,
    });
    expect(result.matchId).toBeNull();
    expect(result.homeAbbr).toBeNull();
    expect(result.guestAbbr).toBeNull();
    expect(result.homeColorOverride).toBeNull();
    expect(result.guestColorOverride).toBeNull();
  });

  it("accepts undefined optional fields (they are absent)", () => {
    const result = broadcastUpsertSchema.parse({ deviceId: "dev1" });
    expect(result.matchId).toBeUndefined();
    expect(result.homeAbbr).toBeUndefined();
  });

  it("rejects missing deviceId", () => {
    expect(() => broadcastUpsertSchema.parse({})).toThrow();
  });

  it("rejects empty deviceId", () => {
    expect(() => broadcastUpsertSchema.parse({ deviceId: "" })).toThrow();
  });

  it("rejects homeAbbr exceeding 8 characters", () => {
    expect(() =>
      broadcastUpsertSchema.parse({ deviceId: "dev1", homeAbbr: "123456789" }),
    ).toThrow();
  });

  it("accepts homeAbbr at max length of 8", () => {
    const result = broadcastUpsertSchema.parse({
      deviceId: "dev1",
      homeAbbr: "12345678",
    });
    expect(result.homeAbbr).toBe("12345678");
  });

  it("rejects guestAbbr exceeding 8 characters", () => {
    expect(() =>
      broadcastUpsertSchema.parse({ deviceId: "dev1", guestAbbr: "123456789" }),
    ).toThrow();
  });

  it("rejects homeColorOverride exceeding 20 characters", () => {
    expect(() =>
      broadcastUpsertSchema.parse({
        deviceId: "dev1",
        homeColorOverride: "x".repeat(21),
      }),
    ).toThrow();
  });

  it("accepts homeColorOverride at max length of 20", () => {
    const val = "x".repeat(20);
    const result = broadcastUpsertSchema.parse({
      deviceId: "dev1",
      homeColorOverride: val,
    });
    expect(result.homeColorOverride).toBe(val);
  });

  it("rejects guestColorOverride exceeding 20 characters", () => {
    expect(() =>
      broadcastUpsertSchema.parse({
        deviceId: "dev1",
        guestColorOverride: "x".repeat(21),
      }),
    ).toThrow();
  });

  it("rejects non-positive matchId", () => {
    expect(() =>
      broadcastUpsertSchema.parse({ deviceId: "dev1", matchId: 0 }),
    ).toThrow();
  });

  it("rejects negative matchId", () => {
    expect(() =>
      broadcastUpsertSchema.parse({ deviceId: "dev1", matchId: -1 }),
    ).toThrow();
  });
});

describe("broadcastStartStopSchema", () => {
  it("accepts valid deviceId", () => {
    const result = broadcastStartStopSchema.parse({ deviceId: "panel-1" });
    expect(result).toEqual({ deviceId: "panel-1" });
  });

  it("rejects missing deviceId", () => {
    expect(() => broadcastStartStopSchema.parse({})).toThrow();
  });

  it("rejects empty deviceId", () => {
    expect(() => broadcastStartStopSchema.parse({ deviceId: "" })).toThrow();
  });
});

describe("broadcastMatchesQuerySchema", () => {
  it("applies default scope of today", () => {
    const result = broadcastMatchesQuerySchema.parse({});
    expect(result).toEqual({ scope: "today" });
  });

  it("accepts scope=all", () => {
    const result = broadcastMatchesQuerySchema.parse({ scope: "all" });
    expect(result).toMatchObject({ scope: "all" });
  });

  it("accepts scope=today explicitly", () => {
    const result = broadcastMatchesQuerySchema.parse({ scope: "today" });
    expect(result).toMatchObject({ scope: "today" });
  });

  it("accepts optional q string", () => {
    const result = broadcastMatchesQuerySchema.parse({ q: "Dragons", scope: "all" });
    expect(result).toMatchObject({ q: "Dragons", scope: "all" });
  });

  it("accepts missing q (undefined)", () => {
    const result = broadcastMatchesQuerySchema.parse({ scope: "all" });
    expect(result.q).toBeUndefined();
  });

  it("rejects invalid scope value", () => {
    expect(() =>
      broadcastMatchesQuerySchema.parse({ scope: "week" }),
    ).toThrow();
  });
});
