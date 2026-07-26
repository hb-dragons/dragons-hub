import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_TZ,
  berlinDayAnchor,
  berlinTimeAnchor,
  calendarDayString,
  plusDaysInBerlin,
  toBerlinDateString,
  todayInBerlin,
} from "./tz";

/**
 * Every test here runs under a non-Berlin TZ on purpose: this machine and the
 * web container both run Europe/Berlin, which hides exactly the bugs these
 * helpers exist to prevent. `vi.stubEnv` is used rather than assigning
 * `process.env.TZ` directly — restoring an originally-unset TZ by assignment
 * writes the string "undefined" and silently flips the worker to UTC.
 */
const ZONES = ["UTC", "America/New_York", "Pacific/Kiritimati", "Pacific/Honolulu"];

/** Renders an instant the way the app does: fixed Berlin timezone. */
function renderInBerlin(d: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ADMIN_TZ, ...opts }).format(d);
}

const BERLIN_DAY = { year: "numeric", month: "2-digit", day: "2-digit" } as const;
const BERLIN_TIME = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } as const;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("toBerlinDateString", () => {
  it.each(ZONES)("names the Berlin day just before midnight (TZ=%s)", (tz) => {
    vi.stubEnv("TZ", tz);
    // 2026-07-25T21:30Z is 23:30 in Berlin (CEST) — still the 25th.
    expect(toBerlinDateString(new Date("2026-07-25T21:30:00Z"))).toBe("2026-07-25");
  });

  it.each(ZONES)("names the Berlin day just after midnight (TZ=%s)", (tz) => {
    vi.stubEnv("TZ", tz);
    // 2026-07-25T22:30Z is 00:30 in Berlin (CEST) — already the 26th.
    expect(toBerlinDateString(new Date("2026-07-25T22:30:00Z"))).toBe("2026-07-26");
  });

  it.each(ZONES)("handles the winter (CET) offset too (TZ=%s)", (tz) => {
    vi.stubEnv("TZ", tz);
    expect(toBerlinDateString(new Date("2026-01-10T22:30:00Z"))).toBe("2026-01-10");
    expect(toBerlinDateString(new Date("2026-01-10T23:30:00Z"))).toBe("2026-01-11");
  });

  it("defaults to now, and backs todayInBerlin/plusDaysInBerlin", () => {
    vi.stubEnv("TZ", "America/New_York");
    vi.useFakeTimers();
    // 20:30 in New York on the 25th is already 02:30 on the 26th in Berlin.
    vi.setSystemTime(new Date("2026-07-26T00:30:00Z"));
    expect(toBerlinDateString()).toBe("2026-07-26");
    expect(todayInBerlin()).toBe("2026-07-26");
    expect(plusDaysInBerlin(1)).toBe("2026-07-27");
  });
});

describe("calendarDayString", () => {
  it.each(ZONES)("reads the day a picker Date stands for (TZ=%s)", (tz) => {
    vi.stubEnv("TZ", tz);
    // react-day-picker hands back local midnight of the clicked day.
    expect(calendarDayString(new Date(2026, 6, 26))).toBe("2026-07-26");
    expect(calendarDayString(new Date(2026, 0, 1))).toBe("2026-01-01");
  });
});

describe("berlinDayAnchor", () => {
  it.each(ZONES)("renders as the same Berlin calendar day (TZ=%s)", (tz) => {
    vi.stubEnv("TZ", tz);
    expect(renderInBerlin(berlinDayAnchor("2026-07-26"), BERLIN_DAY)).toBe("2026-07-26");
    expect(renderInBerlin(berlinDayAnchor("2026-01-01"), BERLIN_DAY)).toBe("2026-01-01");
    // Day either side of a DST switch (2026-03-29 spring forward).
    expect(renderInBerlin(berlinDayAnchor("2026-03-28"), BERLIN_DAY)).toBe("2026-03-28");
    expect(renderInBerlin(berlinDayAnchor("2026-03-29"), BERLIN_DAY)).toBe("2026-03-29");
  });

  it("anchors at noon Berlin, matching the public pages", () => {
    vi.stubEnv("TZ", "UTC");
    expect(renderInBerlin(berlinDayAnchor("2026-07-26"), BERLIN_TIME)).toBe("12:00");
  });

  it("round-trips through toBerlinDateString", () => {
    vi.stubEnv("TZ", "Pacific/Kiritimati");
    expect(toBerlinDateString(berlinDayAnchor("2026-07-26"))).toBe("2026-07-26");
  });

  it("returns an invalid date for junk input", () => {
    vi.stubEnv("TZ", "UTC");
    expect(Number.isNaN(berlinDayAnchor("not-a-date").getTime())).toBe(true);
  });
});

describe("berlinTimeAnchor", () => {
  it.each(ZONES)("renders as the same Berlin wall clock (TZ=%s)", (tz) => {
    vi.stubEnv("TZ", tz);
    expect(renderInBerlin(berlinTimeAnchor("18:00:00"), BERLIN_TIME)).toBe("18:00");
    expect(renderInBerlin(berlinTimeAnchor("21:30:00"), BERLIN_TIME)).toBe("21:30");
    // Either side of midnight Berlin.
    expect(renderInBerlin(berlinTimeAnchor("23:45:00"), BERLIN_TIME)).toBe("23:45");
    expect(renderInBerlin(berlinTimeAnchor("00:15:00"), BERLIN_TIME)).toBe("00:15");
  });

  it("accepts HH:MM as well as HH:MM:SS", () => {
    vi.stubEnv("TZ", "UTC");
    expect(renderInBerlin(berlinTimeAnchor("18:00"), BERLIN_TIME)).toBe("18:00");
  });

  it("is stable across the DST boundary when a day is supplied", () => {
    vi.stubEnv("TZ", "America/New_York");
    // CET (winter) and CEST (summer) must both read back as 18:00.
    expect(renderInBerlin(berlinTimeAnchor("18:00:00", "2026-01-15"), BERLIN_TIME)).toBe("18:00");
    expect(renderInBerlin(berlinTimeAnchor("18:00:00", "2026-07-15"), BERLIN_TIME)).toBe("18:00");
  });

  it("produces the same instant regardless of the runtime zone", () => {
    vi.stubEnv("TZ", "UTC");
    const utc = berlinTimeAnchor("18:00:00").getTime();
    vi.stubEnv("TZ", "Pacific/Honolulu");
    expect(berlinTimeAnchor("18:00:00").getTime()).toBe(utc);
  });

  it("returns an invalid date for junk input", () => {
    vi.stubEnv("TZ", "UTC");
    expect(Number.isNaN(berlinTimeAnchor("nope").getTime())).toBe(true);
  });
});
