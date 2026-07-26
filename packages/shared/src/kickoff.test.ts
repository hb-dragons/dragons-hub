import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLUB_TIME_ZONE,
  daysUntilKickoff,
  formatKickoffCompact,
  formatKickoffLong,
  formatKickoffShortNumeric,
  parseKickoffDate,
  resolveDateLocale,
  todayInClubZone,
} from "./kickoff";

// NOTE: `process.env.TZ = original` does NOT restore an originally-unset TZ —
// it writes the literal string "undefined" and Node silently falls back to UTC
// for the rest of the worker. `vi.stubEnv` / `vi.unstubAllEnvs` deletes the key
// properly, so every timezone test in this file goes through it.
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("todayInClubZone", () => {
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

    for (const tz of ["UTC", "America/New_York", "Pacific/Kiritimati", "Europe/Berlin"]) {
      vi.stubEnv("TZ", tz);
      expect(todayInClubZone(instant)).toBe("2026-04-26");
    }
  });

  it("handles the winter offset (CET, +01:00) as well", () => {
    vi.stubEnv("TZ", "UTC");
    // 23:30 UTC in January is 00:30 the next day in Berlin.
    expect(todayInClubZone(new Date("2026-01-14T23:30:00Z"))).toBe("2026-01-15");
    // 22:30 UTC in January is still the same day in Berlin.
    expect(todayInClubZone(new Date("2026-01-14T22:30:00Z"))).toBe("2026-01-14");
  });

  it("zero-pads month and day", () => {
    vi.stubEnv("TZ", "UTC");
    expect(todayInClubZone(new Date("2026-03-05T10:00:00Z"))).toBe("2026-03-05");
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

describe("parseKickoffDate", () => {
  it("keeps the calendar day west of Greenwich (the HeadToHead bug)", () => {
    // `new Date("2026-04-25")` parses as UTC midnight, which is 25 Apr 20:00 in
    // New York — but `new Date("2026-04-25T00:00:00")` is fine there and breaks
    // instead in zones where local midnight does not exist on a DST day.
    vi.stubEnv("TZ", "America/New_York");
    const d = parseKickoffDate("2026-04-25");

    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3);
    expect(d.getDate()).toBe(25);
  });

  it("survives a zone whose DST transition removes local midnight", () => {
    // Santiago springs forward at 00:00 on 2026-09-06: 00:00 does not exist.
    vi.stubEnv("TZ", "America/Santiago");
    const d = parseKickoffDate("2026-09-06");

    expect(d.getDate()).toBe(6);
    expect(d.getMonth()).toBe(8);
  });

  it("returns an invalid date for a malformed input rather than throwing", () => {
    expect(Number.isNaN(parseKickoffDate("not-a-date").getTime())).toBe(true);
  });
});

describe("formatKickoffCompact", () => {
  it("renders weekday + DD.MM. + HH:MM, dropping seconds", () => {
    vi.stubEnv("TZ", "Europe/Berlin");
    expect(formatKickoffCompact("2026-04-25", "18:30:00", "en-US")).toBe("Sat 25.04. 18:30");
  });

  it("localises the weekday", () => {
    vi.stubEnv("TZ", "Europe/Berlin");
    expect(formatKickoffCompact("2026-04-25", "18:30:00", "de-DE")).toMatch(/^Sa\.? 25\.04\. 18:30$/);
  });

  it("renders the same weekday regardless of device timezone", () => {
    const rendered = new Set<string>();
    for (const tz of ["UTC", "America/New_York", "Pacific/Kiritimati"]) {
      vi.stubEnv("TZ", tz);
      rendered.add(formatKickoffCompact("2026-04-25", "18:30:00", "en-US"));
    }
    expect([...rendered]).toEqual(["Sat 25.04. 18:30"]);
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

  it("is timezone independent", () => {
    vi.stubEnv("TZ", "America/New_York");
    expect(formatKickoffLong("2026-04-25", "en-US")).toBe("Saturday, 25.04.2026");
  });
});

describe("formatKickoffShortNumeric", () => {
  it("renders DD.MM.YY on the kickoff's own calendar day", () => {
    // This is the HeadToHead formatter: it used to render 24.04.26 west of
    // Greenwich because `new Date("2026-04-25")` is UTC midnight.
    vi.stubEnv("TZ", "America/New_York");
    expect(formatKickoffShortNumeric("2026-04-25")).toBe("25.04.26");
  });

  it("agrees with the Berlin rendering", () => {
    vi.stubEnv("TZ", "Europe/Berlin");
    expect(formatKickoffShortNumeric("2026-04-25")).toBe("25.04.26");
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

  it("is NaN for an unparseable kickoff date", () => {
    expect(Number.isNaN(daysUntilKickoff("garbage", new Date("2026-04-25T10:00:00Z")))).toBe(true);
  });
});
