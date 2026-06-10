import { describe, expect, it } from "vitest";
import {
  settingsClubConfigSchema,
  settingsBookingConfigSchema,
  settingsRefereeReminderSchema,
} from "./settings";

describe("settingsClubConfigSchema", () => {
  it("accepts valid clubId and clubName", () => {
    const result = settingsClubConfigSchema.parse({ clubId: 4121, clubName: "Dragons" });
    expect(result).toEqual({ clubId: 4121, clubName: "Dragons" });
  });

  it("rejects missing clubId", () => {
    expect(() => settingsClubConfigSchema.parse({ clubName: "Dragons" })).toThrow();
  });

  it("rejects zero clubId", () => {
    expect(() => settingsClubConfigSchema.parse({ clubId: 0, clubName: "Dragons" })).toThrow();
  });

  it("rejects negative clubId", () => {
    expect(() => settingsClubConfigSchema.parse({ clubId: -1, clubName: "Dragons" })).toThrow();
  });

  it("rejects empty clubName", () => {
    expect(() => settingsClubConfigSchema.parse({ clubId: 1, clubName: "" })).toThrow();
  });

  it("rejects missing clubName", () => {
    expect(() => settingsClubConfigSchema.parse({ clubId: 1 })).toThrow();
  });
});

describe("settingsBookingConfigSchema", () => {
  it("accepts valid booking config", () => {
    const input = { bufferBefore: 60, bufferAfter: 30, gameDuration: 90, dueDaysBefore: 7 };
    const result = settingsBookingConfigSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("accepts zero for buffer values and dueDaysBefore", () => {
    const input = { bufferBefore: 0, bufferAfter: 0, gameDuration: 90, dueDaysBefore: 0 };
    expect(settingsBookingConfigSchema.parse(input)).toEqual(input);
  });

  it("rejects negative bufferBefore", () => {
    expect(() =>
      settingsBookingConfigSchema.parse({ bufferBefore: -1, bufferAfter: 0, gameDuration: 90, dueDaysBefore: 0 }),
    ).toThrow();
  });

  it("rejects negative bufferAfter", () => {
    expect(() =>
      settingsBookingConfigSchema.parse({ bufferBefore: 0, bufferAfter: -1, gameDuration: 90, dueDaysBefore: 0 }),
    ).toThrow();
  });

  it("rejects zero gameDuration", () => {
    expect(() =>
      settingsBookingConfigSchema.parse({ bufferBefore: 0, bufferAfter: 0, gameDuration: 0, dueDaysBefore: 0 }),
    ).toThrow();
  });

  it("rejects negative gameDuration", () => {
    expect(() =>
      settingsBookingConfigSchema.parse({ bufferBefore: 0, bufferAfter: 0, gameDuration: -5, dueDaysBefore: 0 }),
    ).toThrow();
  });

  it("rejects non-integer bufferBefore", () => {
    expect(() =>
      settingsBookingConfigSchema.parse({ bufferBefore: 60.5, bufferAfter: 0, gameDuration: 90, dueDaysBefore: 0 }),
    ).toThrow();
  });

  it("rejects missing fields", () => {
    expect(() => settingsBookingConfigSchema.parse({ bufferBefore: 60 })).toThrow();
  });
});

describe("settingsRefereeReminderSchema", () => {
  it("accepts valid days array", () => {
    const result = settingsRefereeReminderSchema.parse({ days: [7, 3, 1] });
    expect(result).toEqual({ days: [7, 3, 1] });
  });

  it("accepts single day (min 1)", () => {
    const result = settingsRefereeReminderSchema.parse({ days: [14] });
    expect(result).toEqual({ days: [14] });
  });

  it("accepts exactly 10 days (max 10)", () => {
    const days = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = settingsRefereeReminderSchema.parse({ days });
    expect(result).toEqual({ days });
  });

  it("rejects empty days array (min 1)", () => {
    expect(() => settingsRefereeReminderSchema.parse({ days: [] })).toThrow();
  });

  it("rejects more than 10 days (max 10)", () => {
    const days = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    expect(() => settingsRefereeReminderSchema.parse({ days })).toThrow();
  });

  it("rejects zero day value (must be positive)", () => {
    expect(() => settingsRefereeReminderSchema.parse({ days: [0, 3, 7] })).toThrow();
  });

  it("rejects negative day value", () => {
    expect(() => settingsRefereeReminderSchema.parse({ days: [-1, 3, 7] })).toThrow();
  });

  it("rejects non-integer day value", () => {
    expect(() => settingsRefereeReminderSchema.parse({ days: [1.5, 3, 7] })).toThrow();
  });

  it("rejects non-array days", () => {
    expect(() => settingsRefereeReminderSchema.parse({ days: "not-an-array" })).toThrow();
  });

  it("rejects missing days field", () => {
    expect(() => settingsRefereeReminderSchema.parse({})).toThrow();
  });
});
