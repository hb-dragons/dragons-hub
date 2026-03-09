import { describe, expect, it } from "vitest";
import {
  getSaturday,
  getSunday,
  toDateString,
  previousSaturday,
  nextSaturday,
} from "./weekend-utils";

describe("getSaturday", () => {
  it("returns Saturday for a Wednesday", () => {
    const wed = new Date("2026-03-11T10:00:00"); // Wednesday
    expect(toDateString(getSaturday(wed))).toBe("2026-03-14");
  });

  it("returns same day for a Saturday", () => {
    const sat = new Date("2026-03-14T10:00:00");
    expect(toDateString(getSaturday(sat))).toBe("2026-03-14");
  });

  it("returns previous Saturday for a Sunday", () => {
    const sun = new Date("2026-03-15T10:00:00");
    expect(toDateString(getSaturday(sun))).toBe("2026-03-14");
  });

  it("returns Saturday for a Monday", () => {
    const mon = new Date("2026-03-09T10:00:00"); // Monday
    expect(toDateString(getSaturday(mon))).toBe("2026-03-14");
  });

  it("returns Saturday for a Friday", () => {
    const fri = new Date("2026-03-13T10:00:00");
    expect(toDateString(getSaturday(fri))).toBe("2026-03-14");
  });
});

describe("getSunday", () => {
  it("returns the day after Saturday", () => {
    const sat = new Date("2026-03-14T12:00:00");
    expect(toDateString(getSunday(sat))).toBe("2026-03-15");
  });
});

describe("toDateString", () => {
  it("formats date as YYYY-MM-DD", () => {
    expect(toDateString(new Date("2026-01-05T12:00:00"))).toBe("2026-01-05");
  });

  it("zero-pads single digit months and days", () => {
    expect(toDateString(new Date("2026-03-01T12:00:00"))).toBe("2026-03-01");
  });
});

describe("previousSaturday", () => {
  it("returns 7 days earlier", () => {
    const sat = new Date("2026-03-14T12:00:00");
    expect(toDateString(previousSaturday(sat))).toBe("2026-03-07");
  });
});

describe("nextSaturday", () => {
  it("returns 7 days later", () => {
    const sat = new Date("2026-03-14T12:00:00");
    expect(toDateString(nextSaturday(sat))).toBe("2026-03-21");
  });
});
