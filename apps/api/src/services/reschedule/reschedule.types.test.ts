import { describe, expect, it } from "vitest";
import { verifySlotInputSchema } from "./reschedule.types";

describe("verifySlotInputSchema", () => {
  it("accepts a well-formed slot and normalizes HH:MM time to HH:MM:SS", () => {
    const parsed = verifySlotInputSchema.parse({ matchId: 1, date: "2026-02-14", time: "18:00", venueId: 3 });
    expect(parsed.time).toBe("18:00:00");
  });
  it("rejects a malformed date", () => {
    expect(() => verifySlotInputSchema.parse({ matchId: 1, date: "14.02.2026", time: "18:00", venueId: 3 })).toThrow();
  });
  it("accepts an already-normalized HH:MM:SS time unchanged", () => {
    const parsed = verifySlotInputSchema.parse({ matchId: 1, date: "2026-02-14", time: "18:00:00", venueId: 3 });
    expect(parsed.time).toBe("18:00:00");
  });
  it("rejects a malformed time", () => {
    expect(() => verifySlotInputSchema.parse({ matchId: 1, date: "2026-02-14", time: "1800", venueId: 3 })).toThrow();
  });
});
