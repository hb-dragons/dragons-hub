import { describe, expect, it } from "vitest";
import { hallOccupancyQuerySchema } from "./hall-occupancy";

describe("hallOccupancyQuerySchema", () => {
  it("accepts an empty query", () => {
    expect(hallOccupancyQuerySchema.parse({})).toEqual({});
  });

  it("coerces venueId and keeps dates and coverage", () => {
    expect(
      hallOccupancyQuerySchema.parse({
        dateFrom: "2026-09-01",
        dateTo: "2026-09-30",
        venueId: "3",
        coverage: "none",
      }),
    ).toEqual({ dateFrom: "2026-09-01", dateTo: "2026-09-30", venueId: 3, coverage: "none" });
  });

  it("rejects an unknown coverage", () => {
    expect(hallOccupancyQuerySchema.safeParse({ coverage: "pending" }).success).toBe(false);
  });

  it("rejects a non-positive venueId and a malformed date", () => {
    expect(hallOccupancyQuerySchema.safeParse({ venueId: "0" }).success).toBe(false);
    expect(hallOccupancyQuerySchema.safeParse({ dateFrom: "15.03.2026" }).success).toBe(false);
  });
});
