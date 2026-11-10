import { describe, expect, it } from "vitest";
import en from "@/i18n/en.json";
import { lookup } from "../../../test/i18n-bundles";
import type { Translate } from "@/lib/ui/match-a11y";
import { formatPointsDiff, standingStatCells, standingStatHeadings } from "./standing-cells";

const t: Translate = (key) => {
  const template = lookup(en, key);
  if (typeof template !== "string") throw new Error(`missing key ${key}`);
  return template;
};

const item = { played: 10, won: 8, lost: 2, pointsDiff: 54, leaguePoints: 16 };

describe("formatPointsDiff", () => {
  it.each([
    [54, "+54"],
    [0, "0"],
    [-7, "-7"],
  ])("formats %s as %s", (diff, text) => {
    expect(formatPointsDiff(diff)).toBe(text);
  });
});

describe("standingStatHeadings", () => {
  it("names the numeric columns in table order", () => {
    expect(standingStatHeadings(t)).toEqual([
      { key: "played", label: "GP" },
      { key: "won", label: "W" },
      { key: "lost", label: "L" },
      { key: "diff", label: "Diff" },
      { key: "points", label: "Pts" },
    ]);
  });
});

describe("standingStatCells", () => {
  it("lists the numeric columns in table order with their headings", () => {
    expect(standingStatCells(item, t)).toEqual([
      { key: "played", label: "GP", value: "10" },
      { key: "won", label: "W", value: "8" },
      { key: "lost", label: "L", value: "2" },
      { key: "diff", label: "Diff", value: "+54" },
      { key: "points", label: "Pts", value: "16" },
    ]);
  });

  it("signs a negative difference without doubling the minus", () => {
    const diff = standingStatCells({ ...item, pointsDiff: -3 }, t).find((c) => c.key === "diff");
    expect(diff?.value).toBe("-3");
  });
});
