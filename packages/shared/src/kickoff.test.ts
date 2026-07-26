import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLUB_TIME_ZONE,
  calendarDayString,
  clubDayAnchor,
  clubTimeAnchor,
  daysUntilKickoff,
  formatKickoffCompact,
  formatKickoffLong,
  formatKickoffShortNumeric,
  plusDaysInClubZone,
  resolveDateLocale,
  toClubDateString,
  todayInClubZone,
} from "./kickoff";

/**
 * Every timezone test here runs under a non-Berlin TZ on purpose: this machine
 * and the web container both run Europe/Berlin, which hides exactly the bugs
 * these helpers exist to prevent.
 *
 * NOTE: `process.env.TZ = original` does NOT restore an originally-unset TZ —
 * it writes the literal string "undefined" and Node silently falls back to UTC
 * for the rest of the worker. `vi.stubEnv` / `vi.unstubAllEnvs` deletes the key
 * properly, so every timezone test in this file goes through it.
 */
const ZONES = ["UTC", "America/New_York", "Pacific/Kiritimati", "Pacific/Honolulu"];

/** Renders an instant the way every club-pinned surface does. */
function renderInClubZone(d: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CLUB_TIME_ZONE, ...opts }).format(d);
}

const CLUB_DAY = { year: "numeric", month: "2-digit", day: "2-digit" } as const;
const CLUB_TIME = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } as const;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("toClubDateString / todayInClubZone", () => {
  it("resolves the Berlin calendar day, not the UTC one, for a late-evening UTC instant", () => {
    // 23:30 UTC on 25 Apr is already 01:30 on 26 Apr in Berlin (CEST, +02:00).
    // The old `new Date().toISOString().split("T")[0]` returned 2026-04-25 here,
    // which pulled in games that had already started and dropped the current
    // day's results.
    vi.stubEnv("TZ", "UTC");
    const instant = new Date("2026-04-25T23:30:00Z");

    expect(todayInClubZone(instant)).toBe("2026-04-26");
    expect(todayInClubZone(instant)).not.toBe(instant.toISOString().slice(0, 10));
  });

  it("is independent of the device timezone", () => {
    const instant = new Date("2026-04-25T23:30:00Z");

    for (const tz of [...ZONES, "Europe/Berlin"]) {
      vi.stubEnv("TZ", tz);
      expect(todayInClubZone(instant)).toBe("2026-04-26");
      expect(toClubDateString(instant)).toBe("2026-04-26");
    }
  });

  it.each(ZONES)("names the Berlin day just before midnight (TZ=%s)", (tz) => {
    vi.stubEnv("TZ", tz);
    // 2026-07-25T21:30Z is 23:30 in Berlin (CEST) — still the 25th.
    expect(toClubDateString(new Date("2026-07-25T21:30:00Z"))).toBe("2026-07-25");
  });

  it.each(ZONES)("names the Berlin day just after midnight (TZ=%s)", (tz) => {
    vi.stubEnv("TZ", tz);
    // 2026-07-25T22:30Z is 00:30 in Berlin (CEST) — already the 26th.
    expect(toClubDateString(new Date("2026-07-25T22:30:00Z"))).toBe("2026-07-26");
  });

  it("handles the winter offset (CET, +01:00) as well", () => {
    vi.stubEnv("TZ", "UTC");
    // 23:30 UTC in January is 00:30 the next day in Berlin.
    expect(todayInClubZone(new Date("2026-01-14T23:30:00Z"))).toBe("2026-01-15");
    // 22:30 UTC in January is still the same day in Berlin.
    expect(todayInClubZone(new Date("2026-01-14T22:30:00Z"))).toBe("2026-01-14");
  });

  it.each(ZONES)("handles the winter (CET) offset from an instant too (TZ=%s)", (tz) => {
    vi.stubEnv("TZ", tz);
    expect(toClubDateString(new Date("2026-01-10T22:30:00Z"))).toBe("2026-01-10");
    expect(toClubDateString(new Date("2026-01-10T23:30:00Z"))).toBe("2026-01-11");
  });

  it("zero-pads month and day", () => {
    vi.stubEnv("TZ", "UTC");
    expect(todayInClubZone(new Date("2026-03-05T10:00:00Z"))).toBe("2026-03-05");
  });

  it("defaults to now, and backs todayInClubZone/plusDaysInClubZone", () => {
    vi.stubEnv("TZ", "America/New_York");
    vi.useFakeTimers();
    // 20:30 in New York on the 25th is already 02:30 on the 26th in Berlin.
    vi.setSystemTime(new Date("2026-07-26T00:30:00Z"));
    expect(toClubDateString()).toBe("2026-07-26");
    expect(todayInClubZone()).toBe("2026-07-26");
    expect(plusDaysInClubZone(1)).toBe("2026-07-27");
    expect(plusDaysInClubZone(14)).toBe("2026-08-09");
    expect(plusDaysInClubZone(-1)).toBe("2026-07-25");
  });

  it("returns an empty string for an invalid instant rather than 'Invalid Date'", () => {
    expect(toClubDateString(new Date(NaN))).toBe("");
  });

  it("names the club timezone the kickoff dates are expressed in", () => {
    expect(CLUB_TIME_ZONE).toBe("Europe/Berlin");
  });
});

describe("resolveDateLocale", () => {
  it("maps the app's locale onto a BCP-47 date locale", () => {
    expect(resolveDateLocale("de")).toBe("de-DE");
    expect(resolveDateLocale("en")).toBe("en-US");
  });

  it("treats regional German variants as German", () => {
    expect(resolveDateLocale("de-AT")).toBe("de-DE");
    expect(resolveDateLocale("DE")).toBe("de-DE");
  });

  it("falls back to en-US for anything else, including no locale at all", () => {
    expect(resolveDateLocale("fr")).toBe("en-US");
    expect(resolveDateLocale(null)).toBe("en-US");
    expect(resolveDateLocale(undefined)).toBe("en-US");
  });
});

describe("calendarDayString", () => {
  it.each(ZONES)("reads the day a picker Date stands for (TZ=%s)", (tz) => {
    vi.stubEnv("TZ", tz);
    // react-day-picker hands back local midnight of the clicked day.
    expect(calendarDayString(new Date(2026, 6, 26))).toBe("2026-07-26");
    expect(calendarDayString(new Date(2026, 0, 1))).toBe("2026-01-01");
  });

  it("is deliberately NOT a club-zone conversion", () => {
    // Local midnight on 26 Jul in Kiritimati (+14) is 25 Jul 10:00 in Berlin.
    // Reading it club-pinned would hand the filter the wrong day; reading the
    // local components gives the day the user actually clicked.
    vi.stubEnv("TZ", "Pacific/Kiritimati");
    const picked = new Date(2026, 6, 26);

    expect(calendarDayString(picked)).toBe("2026-07-26");
    expect(toClubDateString(picked)).toBe("2026-07-25");
  });

  it("returns an empty string for an invalid picker date", () => {
    expect(calendarDayString(new Date(NaN))).toBe("");
  });
});

describe("clubDayAnchor", () => {
  it("keeps the calendar day west of Greenwich (the HeadToHead bug)", () => {
    // `new Date("2026-04-25")` parses as UTC midnight, which is 25 Apr 20:00 in
    // New York — but `new Date("2026-04-25T00:00:00")` is fine there and breaks
    // instead in zones where local midnight does not exist on a DST day.
    vi.stubEnv("TZ", "America/New_York");
    const d = clubDayAnchor("2026-04-25");

    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3);
    expect(d.getDate()).toBe(25);
  });

  it("survives a zone whose DST transition removes local midnight", () => {
    // Santiago springs forward at 00:00 on 2026-09-06: 00:00 does not exist.
    vi.stubEnv("TZ", "America/Santiago");
    const d = clubDayAnchor("2026-09-06");

    expect(d.getDate()).toBe(6);
    expect(d.getMonth()).toBe(8);
  });

  it.each(ZONES)("renders as the same Berlin calendar day (TZ=%s)", (tz) => {
    vi.stubEnv("TZ", tz);
    expect(renderInClubZone(clubDayAnchor("2026-07-26"), CLUB_DAY)).toBe("2026-07-26");
    expect(renderInClubZone(clubDayAnchor("2026-01-01"), CLUB_DAY)).toBe("2026-01-01");
    // Day either side of a DST switch (2026-03-29 spring forward).
    expect(renderInClubZone(clubDayAnchor("2026-03-28"), CLUB_DAY)).toBe("2026-03-28");
    expect(renderInClubZone(clubDayAnchor("2026-03-29"), CLUB_DAY)).toBe("2026-03-29");
  });

  it.each(ZONES)(
    "anchors noon in the club zone, so a club-pinned formatter reads back the same day (TZ=%s)",
    (tz) => {
      // The divergence this module was converged to remove: an anchor built as
      // `new Date(`${date}T12:00:00`)` is noon in the *device* zone, which
      // renders as 16 Jul in Berlin for a viewer in Honolulu.
      vi.stubEnv("TZ", tz);
      expect(renderInClubZone(clubDayAnchor("2026-07-15"), CLUB_DAY)).toBe("2026-07-15");
    },
  );

  it("anchors at noon Berlin, matching the public pages", () => {
    vi.stubEnv("TZ", "UTC");
    expect(renderInClubZone(clubDayAnchor("2026-07-26"), CLUB_TIME)).toBe("12:00");
  });

  it("round-trips through toClubDateString", () => {
    vi.stubEnv("TZ", "Pacific/Kiritimati");
    expect(toClubDateString(clubDayAnchor("2026-07-26"))).toBe("2026-07-26");
  });

  it("produces the same instant regardless of the runtime zone", () => {
    vi.stubEnv("TZ", "UTC");
    const utc = clubDayAnchor("2026-07-15").getTime();
    vi.stubEnv("TZ", "Pacific/Honolulu");
    expect(clubDayAnchor("2026-07-15").getTime()).toBe(utc);
  });

  it("returns an invalid date for a malformed input rather than throwing", () => {
    vi.stubEnv("TZ", "UTC");
    expect(Number.isNaN(clubDayAnchor("not-a-date").getTime())).toBe(true);
  });

  it("rejects an out-of-range day instead of silently rolling it over", () => {
    vi.stubEnv("TZ", "UTC");
    expect(Number.isNaN(clubDayAnchor("2026-02-30").getTime())).toBe(true);
    expect(Number.isNaN(clubDayAnchor("2026-13-01").getTime())).toBe(true);
  });
});

describe("clubTimeAnchor", () => {
  it.each(ZONES)("renders as the same Berlin wall clock (TZ=%s)", (tz) => {
    vi.stubEnv("TZ", tz);
    expect(renderInClubZone(clubTimeAnchor("18:00:00"), CLUB_TIME)).toBe("18:00");
    expect(renderInClubZone(clubTimeAnchor("21:30:00"), CLUB_TIME)).toBe("21:30");
    // Either side of midnight Berlin.
    expect(renderInClubZone(clubTimeAnchor("23:45:00"), CLUB_TIME)).toBe("23:45");
    expect(renderInClubZone(clubTimeAnchor("00:15:00"), CLUB_TIME)).toBe("00:15");
  });

  it("accepts HH:MM as well as HH:MM:SS", () => {
    vi.stubEnv("TZ", "UTC");
    expect(renderInClubZone(clubTimeAnchor("18:00"), CLUB_TIME)).toBe("18:00");
  });

  it("is stable across the DST boundary when a day is supplied", () => {
    vi.stubEnv("TZ", "America/New_York");
    // CET (winter) and CEST (summer) must both read back as 18:00.
    expect(renderInClubZone(clubTimeAnchor("18:00:00", "2026-01-15"), CLUB_TIME)).toBe("18:00");
    expect(renderInClubZone(clubTimeAnchor("18:00:00", "2026-07-15"), CLUB_TIME)).toBe("18:00");
  });

  it("falls back to the default anchor day when given a junk day", () => {
    vi.stubEnv("TZ", "UTC");
    expect(renderInClubZone(clubTimeAnchor("18:00:00", "nope"), CLUB_TIME)).toBe("18:00");
  });

  it("produces the same instant regardless of the runtime zone", () => {
    vi.stubEnv("TZ", "UTC");
    const utc = clubTimeAnchor("18:00:00").getTime();
    vi.stubEnv("TZ", "Pacific/Honolulu");
    expect(clubTimeAnchor("18:00:00").getTime()).toBe(utc);
  });

  it("returns an invalid date for junk input", () => {
    vi.stubEnv("TZ", "UTC");
    expect(Number.isNaN(clubTimeAnchor("nope").getTime())).toBe(true);
  });
});

describe("formatKickoffCompact", () => {
  it("renders weekday + DD.MM. + HH:MM, dropping seconds", () => {
    vi.stubEnv("TZ", "Europe/Berlin");
    expect(formatKickoffCompact("2026-04-25", "18:30:00", "en-US")).toBe("Sat 25.04. 18:30");
  });

  it("localises the weekday", () => {
    vi.stubEnv("TZ", "Europe/Berlin");
    expect(formatKickoffCompact("2026-04-25", "18:30:00", "de-DE")).toMatch(
      /^Sa\.? 25\.04\. 18:30$/,
    );
  });

  it.each(ZONES)("renders the same weekday regardless of device timezone (TZ=%s)", (tz) => {
    vi.stubEnv("TZ", tz);
    expect(formatKickoffCompact("2026-04-25", "18:30:00", "en-US")).toBe("Sat 25.04. 18:30");
  });

  it("omits the time when none is given", () => {
    vi.stubEnv("TZ", "Europe/Berlin");
    expect(formatKickoffCompact("2026-04-25", null, "en-US")).toBe("Sat 25.04.");
  });

  it("returns the raw date for an unparseable input", () => {
    expect(formatKickoffCompact("garbage", "18:30:00", "en-US")).toBe("garbage");
  });
});

describe("formatKickoffLong", () => {
  it("renders the full weekday and a four-digit year", () => {
    vi.stubEnv("TZ", "Europe/Berlin");
    expect(formatKickoffLong("2026-04-25", "en-US")).toBe("Saturday, 25.04.2026");
  });

  it.each(ZONES)("is timezone independent (TZ=%s)", (tz) => {
    vi.stubEnv("TZ", tz);
    expect(formatKickoffLong("2026-04-25", "en-US")).toBe("Saturday, 25.04.2026");
  });

  it("returns the raw date for an unparseable input", () => {
    expect(formatKickoffLong("garbage", "en-US")).toBe("garbage");
  });
});

describe("formatKickoffShortNumeric", () => {
  it.each(ZONES)("renders DD.MM.YY on the kickoff's own calendar day (TZ=%s)", (tz) => {
    // This is the HeadToHead formatter: it used to render 24.04.26 west of
    // Greenwich because `new Date("2026-04-25")` is UTC midnight.
    vi.stubEnv("TZ", tz);
    expect(formatKickoffShortNumeric("2026-04-25")).toBe("25.04.26");
  });

  it("agrees with the Berlin rendering", () => {
    vi.stubEnv("TZ", "Europe/Berlin");
    expect(formatKickoffShortNumeric("2026-04-25")).toBe("25.04.26");
  });

  it("returns the raw date for an unparseable input", () => {
    expect(formatKickoffShortNumeric("garbage")).toBe("garbage");
  });
});

describe("daysUntilKickoff", () => {
  it("counts from the club's calendar day, not the device's", () => {
    vi.stubEnv("TZ", "UTC");
    // Still 25 Apr in UTC, already 26 Apr in Berlin: a 26 Apr kickoff is today.
    const instant = new Date("2026-04-25T23:30:00Z");

    expect(daysUntilKickoff("2026-04-26", instant)).toBe(0);
    expect(daysUntilKickoff("2026-04-27", instant)).toBe(1);
    expect(daysUntilKickoff("2026-04-25", instant)).toBe(-1);
  });

  it("stays whole across a device-side DST transition", () => {
    vi.stubEnv("TZ", "Europe/Berlin");
    // 2026-03-29 is the European spring-forward day.
    expect(daysUntilKickoff("2026-03-30", new Date("2026-03-27T10:00:00Z"))).toBe(3);
  });

  it.each(ZONES)("stays whole across the club-side DST transition (TZ=%s)", (tz) => {
    vi.stubEnv("TZ", tz);
    // Spans Berlin's spring-forward (2026-03-29) and its autumn fall-back
    // (2026-10-25); both ends are noon anchors, so the hour never leaks out.
    expect(daysUntilKickoff("2026-03-30", new Date("2026-03-27T10:00:00Z"))).toBe(3);
    expect(daysUntilKickoff("2026-10-26", new Date("2026-10-23T10:00:00Z"))).toBe(3);
  });

  it("is NaN for an unparseable kickoff date", () => {
    expect(Number.isNaN(daysUntilKickoff("garbage", new Date("2026-04-25T10:00:00Z")))).toBe(true);
  });
});
