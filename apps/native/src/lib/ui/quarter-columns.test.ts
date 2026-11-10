import { describe, expect, it } from "vitest";
import en from "@/i18n/en.json";
import { lookup } from "../../../test/i18n-bundles";
import type { Translate } from "@/lib/ui/match-a11y";
import { hasQuarterData, quarterColumns, type QuarterScores } from "./quarter-columns";

const t: Translate = (key) => {
  const template = lookup(en, key);
  if (typeof template !== "string") throw new Error(`missing key ${key}`);
  return template;
};

const empty: QuarterScores = {
  homeQ1: null, guestQ1: null, homeQ2: null, guestQ2: null,
  homeQ3: null, guestQ3: null, homeQ4: null, guestQ4: null,
  homeQ5: null, guestQ5: null, homeQ6: null, guestQ6: null,
  homeQ7: null, guestQ7: null, homeQ8: null, guestQ8: null,
  homeOt1: null, guestOt1: null, homeOt2: null, guestOt2: null,
  homeHalftimeScore: null, guestHalftimeScore: null,
  homeScore: null, guestScore: null,
};

const fourQuarters: QuarterScores = {
  ...empty,
  homeQ1: 18, guestQ1: 12, homeQ2: 20, guestQ2: 15,
  homeQ3: 14, guestQ3: 22, homeQ4: 19, guestQ4: 17,
  homeHalftimeScore: 38, guestHalftimeScore: 27,
  homeScore: 71, guestScore: 66,
};

describe("hasQuarterData", () => {
  it("is false without any quarter score", () => {
    expect(hasQuarterData(empty)).toBe(false);
  });

  it("is true once the first quarters are in", () => {
    expect(hasQuarterData({ ...empty, guestQ2: 9 })).toBe(true);
  });
});

describe("quarterColumns", () => {
  it("lists four quarters, halftime and total for a regular game", () => {
    expect(quarterColumns(fourQuarters, t).map((c) => c.label)).toEqual([
      "Q1", "Q2", "Q3", "Q4", "HT", "Tot",
    ]);
    expect(quarterColumns(fourQuarters, t)[0]).toEqual({ label: "Q1", homeValue: 18, guestValue: 12 });
  });

  it("lists eight periods when the game is played in eighths", () => {
    const labels = quarterColumns({ ...fourQuarters, homeQ5: 4 }, t).map((c) => c.label);
    expect(labels.slice(0, 8)).toEqual(["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8"]);
  });

  it("adds overtime columns only when they were played", () => {
    const labels = quarterColumns({ ...fourQuarters, homeOt1: 8, guestOt2: 3 }, t).map(
      (c) => c.label,
    );
    expect(labels).toEqual(["Q1", "Q2", "Q3", "Q4", "OT1", "OT2", "HT", "Tot"]);
  });

  it("leaves out halftime and total while they are unknown", () => {
    const labels = quarterColumns(
      { ...fourQuarters, homeHalftimeScore: null, guestHalftimeScore: null, homeScore: null, guestScore: null },
      t,
    ).map((c) => c.label);
    expect(labels).toEqual(["Q1", "Q2", "Q3", "Q4"]);
  });
});
