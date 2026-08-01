import { describe, expect, test } from "vitest";
import { formatGameDate, formatGameTime } from "./game-format";

/**
 * Ports of dragons-app `app/utils/format.ts`, which formatted on a
 * Berlin-localtime server. Pinned to Europe/Berlin here so a UTC build or a
 * traveling fan's phone renders the same card labels.
 */
describe("formatGameDate", () => {
  test("renders the long weekday with two-digit day, month and year", () => {
    expect(formatGameDate("2026-04-25")).toBe("Samstag, 25.04.26");
  });

  test("stays on the club-zone day for dates that shift under UTC parsing", () => {
    // Legacy parsed "YYYY-MM-DD" as UTC midnight and rendered it in Berlin —
    // same calendar day. A device west of Greenwich must not show the 31st.
    expect(formatGameDate("2026-01-01")).toBe("Donnerstag, 01.01.26");
  });

  test("returns the raw string for input that is not a calendar day", () => {
    expect(formatGameDate("kein-datum")).toBe("kein-datum");
  });
});

describe("formatGameTime", () => {
  test("drops the seconds from a federation wall-clock time", () => {
    expect(formatGameTime("15:00:00")).toBe("15:00");
  });

  test("keeps an already short time unchanged", () => {
    expect(formatGameTime("09:30")).toBe("09:30");
  });
});
