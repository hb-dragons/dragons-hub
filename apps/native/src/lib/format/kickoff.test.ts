import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `@/lib/i18n` pulls in expo-localization at module load; the only thing this
// module needs from it is the current app locale.
const { i18nStub } = vi.hoisted(() => ({ i18nStub: { locale: "de" } }));
vi.mock("@/lib/i18n", () => ({ i18n: i18nStub }));

import {
  kickoffCompact,
  kickoffLong,
  kickoffShortNumeric,
  kickoffToday,
  kickoffCountdownDays,
} from "./kickoff";

beforeEach(() => {
  i18nStub.locale = "de";
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("native kickoff formatters", () => {
  it("threads the app locale into the shared compact formatter", () => {
    vi.stubEnv("TZ", "Europe/Berlin");

    i18nStub.locale = "en";
    expect(kickoffCompact("2026-04-25", "18:30:00")).toBe("Sat 25.04. 18:30");

    i18nStub.locale = "de";
    expect(kickoffCompact("2026-04-25", "18:30:00")).toMatch(/^Sa\.? 25\.04\. 18:30$/);
  });

  it("reads the locale per call, so a locale switch is picked up without a reload", () => {
    vi.stubEnv("TZ", "Europe/Berlin");
    const first = kickoffLong("2026-04-25");
    i18nStub.locale = "en";
    const second = kickoffLong("2026-04-25");

    expect(first).not.toBe(second);
    expect(second).toBe("Saturday, 25.04.2026");
  });

  it("renders the head-to-head numeric date on the kickoff's own calendar day", () => {
    // Regression guard for the `new Date("YYYY-MM-DD")` (UTC midnight) parse
    // that rendered the previous day west of Greenwich.
    vi.stubEnv("TZ", "America/New_York");
    expect(kickoffShortNumeric("2026-04-25")).toBe("25.04.26");
  });

  it("resolves 'today' in the club timezone rather than UTC", () => {
    vi.stubEnv("TZ", "UTC");
    expect(kickoffToday(new Date("2026-04-25T23:30:00Z"))).toBe("2026-04-26");
  });

  it("counts the home-screen countdown from the club's calendar day", () => {
    vi.stubEnv("TZ", "UTC");
    const instant = new Date("2026-04-25T23:30:00Z");
    expect(kickoffCountdownDays("2026-04-26", instant)).toBe(0);
    expect(kickoffCountdownDays("2026-04-28", instant)).toBe(2);
  });
});
