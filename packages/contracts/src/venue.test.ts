import { describe, expect, it } from "vitest";
import { venueSearchQuerySchema } from "./venue";

describe("venueSearchQuerySchema", () => {
  it("parses valid query with defaults", () => {
    const result = venueSearchQuerySchema.parse({ q: "Sporthalle" });
    expect(result).toEqual({ q: "Sporthalle", limit: 10 });
  });

  it("accepts explicit limit within bounds", () => {
    const result = venueSearchQuerySchema.parse({ q: "Arena", limit: "25" });
    expect(result).toEqual({ q: "Arena", limit: 25 });
  });

  it("accepts limit at minimum (1)", () => {
    const result = venueSearchQuerySchema.parse({ q: "Test", limit: "1" });
    expect(result).toMatchObject({ limit: 1 });
  });

  it("accepts limit at maximum (50)", () => {
    const result = venueSearchQuerySchema.parse({ q: "Test", limit: "50" });
    expect(result).toMatchObject({ limit: 50 });
  });

  it("coerces string limit to number", () => {
    const result = venueSearchQuerySchema.parse({ q: "Gym", limit: "5" });
    expect(result.limit).toBe(5);
  });

  it("rejects missing q", () => {
    expect(() => venueSearchQuerySchema.parse({ limit: "10" })).toThrow();
  });

  it("rejects empty q string", () => {
    expect(() => venueSearchQuerySchema.parse({ q: "", limit: "10" })).toThrow();
  });

  it("rejects limit of zero", () => {
    expect(() => venueSearchQuerySchema.parse({ q: "Test", limit: "0" })).toThrow();
  });

  it("rejects negative limit", () => {
    expect(() => venueSearchQuerySchema.parse({ q: "Test", limit: "-1" })).toThrow();
  });

  it("rejects limit above 50", () => {
    expect(() => venueSearchQuerySchema.parse({ q: "Test", limit: "51" })).toThrow();
  });

  it("rejects non-numeric limit string", () => {
    expect(() => venueSearchQuerySchema.parse({ q: "Test", limit: "abc" })).toThrow();
  });
});
