import { describe, it, expect } from "vitest";
import { toDateString } from "@/lib/weekend-utils";
import { getLastWeekendSaturday, getNextWeekendSaturday, getISOWeekAndYear } from "./weekend-utils";

describe("getLastWeekendSaturday", () => {
  it("returns previous Saturday when today is Monday", () => {
    const result = getLastWeekendSaturday(new Date(2026, 2, 9));
    expect(toDateString(result)).toBe("2026-03-07");
  });

  it("returns previous week Saturday when today is Saturday", () => {
    const result = getLastWeekendSaturday(new Date(2026, 2, 7));
    expect(toDateString(result)).toBe("2026-02-28");
  });

  it("returns previous week Saturday when today is Sunday", () => {
    const result = getLastWeekendSaturday(new Date(2026, 2, 8));
    expect(toDateString(result)).toBe("2026-02-28");
  });

  it("returns previous Saturday when today is Friday", () => {
    const result = getLastWeekendSaturday(new Date(2026, 2, 13));
    expect(toDateString(result)).toBe("2026-03-07");
  });

  it("returns previous Saturday when today is Wednesday", () => {
    const result = getLastWeekendSaturday(new Date(2026, 2, 11));
    expect(toDateString(result)).toBe("2026-03-07");
  });
});

describe("getNextWeekendSaturday", () => {
  it("returns this coming Saturday when today is Monday", () => {
    const result = getNextWeekendSaturday(new Date(2026, 2, 9));
    expect(toDateString(result)).toBe("2026-03-14");
  });

  it("returns next Saturday when today is Saturday", () => {
    const result = getNextWeekendSaturday(new Date(2026, 2, 7));
    expect(toDateString(result)).toBe("2026-03-14");
  });

  it("returns next Saturday when today is Sunday", () => {
    const result = getNextWeekendSaturday(new Date(2026, 2, 8));
    expect(toDateString(result)).toBe("2026-03-14");
  });

  it("returns this coming Saturday when today is Wednesday", () => {
    const result = getNextWeekendSaturday(new Date(2026, 2, 11));
    expect(toDateString(result)).toBe("2026-03-14");
  });
});

describe("getISOWeekAndYear", () => {
  it("returns correct ISO week for a known date", () => {
    const result = getISOWeekAndYear(new Date(2026, 2, 7));
    expect(result).toEqual({ week: 10, year: 2026 });
  });

  it("handles year boundary (Jan 1 2026 is week 1)", () => {
    const result = getISOWeekAndYear(new Date(2026, 0, 1));
    expect(result).toEqual({ week: 1, year: 2026 });
  });
});
