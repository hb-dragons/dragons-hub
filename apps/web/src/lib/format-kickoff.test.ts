import { describe, it, expect } from "vitest";
import { createFormatter } from "next-intl";
import { formatKickoff } from "./format-kickoff";

const en = createFormatter({ locale: "en", timeZone: "Europe/Berlin" });
const de = createFormatter({ locale: "de", timeZone: "Europe/Berlin" });

describe("formatKickoff", () => {
  it("formats date + time for en (drops seconds)", () => {
    expect(formatKickoff(en, "2026-04-25", "18:30:00")).toBe("Sat, Apr 25 · 18:30");
  });

  it("formats date + time for de (locale ordering)", () => {
    expect(formatKickoff(de, "2026-04-25", "18:30:00")).toBe("Sa., 25. Apr. · 18:30");
  });

  it("formats date only when time is omitted (en)", () => {
    expect(formatKickoff(en, "2026-04-25")).toBe("Sat, Apr 25");
  });

  it("formats date only when time is null (de)", () => {
    expect(formatKickoff(de, "2026-04-25", null)).toBe("Sa., 25. Apr.");
  });

  it("uses the noon anchor so the time never rolls the date", () => {
    expect(formatKickoff(en, "2026-01-01", "00:00:00")).toBe("Thu, Jan 1 · 00:00");
  });
});
