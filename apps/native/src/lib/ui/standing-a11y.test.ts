import { describe, expect, it } from "vitest";
import en from "@/i18n/en.json";
import { lookup } from "../../../test/i18n-bundles";
import type { Translate } from "@/lib/ui/match-a11y";
import { standingA11yLabel } from "./standing-a11y";

const t: Translate = (key, options = {}) => {
  const template = lookup(en, key);
  if (typeof template !== "string") throw new Error(`missing key ${key}`);
  return template.replace(/%\{(\w+)\}/g, (_, name: string) => String(options[name]));
};

const item = {
  position: 1,
  played: 10,
  won: 8,
  lost: 2,
  pointsDiff: 54,
  leaguePoints: 16,
  verzicht: false,
};

describe("standingA11yLabel", () => {
  it("names every number in the row", () => {
    expect(standingA11yLabel(item, "Dragons", t)).toBe(
      "Place 1, Dragons, 10 played, 8 won, 2 lost, point difference +54, 16 points",
    );
  });

  it("signs a negative difference without doubling the minus", () => {
    expect(standingA11yLabel({ ...item, pointsDiff: -12 }, "Dragons", t)).toContain(
      "point difference -12,",
    );
  });

  it("leaves an even difference unsigned", () => {
    expect(standingA11yLabel({ ...item, pointsDiff: 0 }, "Dragons", t)).toContain(
      "point difference 0,",
    );
  });

  it("says when a team has withdrawn", () => {
    expect(standingA11yLabel({ ...item, verzicht: true }, "Dragons", t)).toMatch(/, withdrawn$/);
  });
});
