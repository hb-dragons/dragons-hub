import { describe, expect, it } from "vitest";

import { formatLocalDate, parseLocalDate } from "@/lib/format/local-date";

/**
 * The due-date sheet hands a `Date` to the native picker and a `YYYY-MM-DD`
 * string to the API. Both conversions have to stay on the device's local day:
 * `new Date("2026-04-27")` parses as UTC midnight, which is the day *before*
 * anywhere west of Greenwich, and `toISOString().slice(0, 10)` shifts back the
 * other way east of it.
 */

describe("local date conversion", () => {
  it("parses YYYY-MM-DD as local midnight", () => {
    const date = parseLocalDate("2026-04-27");

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(3);
    expect(date.getDate()).toBe(27);
    expect(date.getHours()).toBe(0);
  });

  it("ignores a time component the API may append", () => {
    expect(formatLocalDate(parseLocalDate("2026-04-27T22:00:00.000Z"))).toBe("2026-04-27");
  });

  it("formats a Date back to a zero-padded local day", () => {
    expect(formatLocalDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("round-trips every day it is given", () => {
    for (const day of ["2026-01-01", "2026-06-15", "2026-12-31"]) {
      expect(formatLocalDate(parseLocalDate(day))).toBe(day);
    }
  });

  // A late-evening local time must format as that evening's date, not as
  // tomorrow — which is what an ISO-string slice would produce east of UTC.
  it("formats a late-evening Date as the same local day", () => {
    expect(formatLocalDate(new Date(2026, 6, 4, 23, 30))).toBe("2026-07-04");
  });

  it("falls back to Date parsing for an unrecognised string", () => {
    expect(Number.isNaN(parseLocalDate("not-a-date").getTime())).toBe(true);
  });
});
