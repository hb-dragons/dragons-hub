import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import de from "@/i18n/de.json";
import en from "@/i18n/en.json";
import { lookup } from "../../../test/i18n-bundles";

// `@/lib/i18n` pulls in expo-localization at module load; the bound wrapper
// only needs a locale and a translator, which the stub reads from the bundles.
const { i18nStub } = vi.hoisted(() => ({
  i18nStub: { locale: "en", t: (_key: string, _options?: Record<string, string | number>): string => "" },
}));
vi.mock("@/lib/i18n", () => ({ i18n: i18nStub }));

import { buildMatchA11yLabel, matchA11yLabel, type MatchA11yInput, type Translate } from "./match-a11y";

/** A translator over a real bundle, interpolating `%{var}` the way i18n-js does. */
function translator(bundle: object): Translate {
  return (key, options = {}) => {
    const template = lookup(bundle, key);
    if (typeof template !== "string") throw new Error(`missing key ${key}`);
    return template.replace(/%\{(\w+)\}/g, (_, name: string) => String(options[name]));
  };
}

const t = translator(en);

function match(overrides: Partial<MatchA11yInput> = {}): MatchA11yInput {
  return {
    homeName: "Dragons",
    guestName: "Rhein Stars",
    homeScore: null,
    guestScore: null,
    kickoffDate: "2026-04-25",
    kickoffTime: "18:30:00",
    ownSide: "home",
    ...overrides,
  };
}

beforeEach(() => {
  // A non-Berlin zone: the day must come from the club-zone helpers, not the
  // device clock.
  vi.stubEnv("TZ", "America/Los_Angeles");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildMatchA11yLabel", () => {
  it("reads a result as a sentence, with the outcome for our side", () => {
    expect(buildMatchA11yLabel(match({ homeScore: 75, guestScore: 62 }), t, "en-US")).toBe(
      "Dragons 75 vs Rhein Stars 62, final, won, Saturday, 25.04.2026",
    );
  });

  it("says lost when our side is the guest and scored less", () => {
    expect(
      buildMatchA11yLabel(match({ homeScore: 80, guestScore: 70, ownSide: "guest" }), t, "en-US"),
    ).toBe("Dragons 80 vs Rhein Stars 70, final, lost, Saturday, 25.04.2026");
  });

  it("leaves the outcome out when neither side is ours", () => {
    expect(
      buildMatchA11yLabel(match({ homeScore: 80, guestScore: 70, ownSide: null }), t, "en-US"),
    ).toBe("Dragons 80 vs Rhein Stars 70, final, Saturday, 25.04.2026");
  });

  it("reads an upcoming game with its day and kickoff time", () => {
    expect(buildMatchA11yLabel(match(), t, "en-US")).toBe(
      "Dragons vs Rhein Stars, Saturday, 25.04.2026 at 18:30",
    );
  });

  it("drops the time when the game has none", () => {
    expect(buildMatchA11yLabel(match({ kickoffTime: null }), t, "en-US")).toBe(
      "Dragons vs Rhein Stars, Saturday, 25.04.2026",
    );
  });

  it("says cancelled instead of an outcome", () => {
    expect(
      buildMatchA11yLabel(match({ isCancelled: true, homeScore: 20, guestScore: 0 }), t, "en-US"),
    ).toBe("Dragons 20 vs Rhein Stars 0, cancelled, Saturday, 25.04.2026");
  });

  it("marks a forfeit and still says who it went to", () => {
    expect(
      buildMatchA11yLabel(match({ isForfeited: true, homeScore: 0, guestScore: 20 }), t, "en-US"),
    ).toBe("Dragons 0 vs Rhein Stars 20, forfeited, lost, Saturday, 25.04.2026");
  });

  it("speaks German from the German bundle and date locale", () => {
    expect(buildMatchA11yLabel(match(), translator(de), "de-DE")).toBe(
      "Dragons gegen Rhein Stars, Samstag, 25.04.2026 um 18:30 Uhr",
    );
    expect(
      buildMatchA11yLabel(match({ homeScore: 75, guestScore: 62 }), translator(de), "de-DE"),
    ).toBe("Dragons 75 gegen Rhein Stars 62, Endstand, gewonnen, Samstag, 25.04.2026");
  });
});

describe("matchA11yLabel", () => {
  it("binds the app's current translator and locale", () => {
    i18nStub.locale = "de";
    i18nStub.t = translator(de);
    expect(matchA11yLabel(match())).toBe("Dragons gegen Rhein Stars, Samstag, 25.04.2026 um 18:30 Uhr");
  });
});
