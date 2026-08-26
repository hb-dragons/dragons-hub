import { describe, expect, it } from "vitest";

import { boardMismatches, IMPRESSUM_BOARD } from "./board";

const cms = (entries: Array<[string, string]>) =>
  entries.map(([role, name]) => ({ role, person: { name } }));

const matching = cms([
  ["1. Vorsitzender", "Kianusch Pour Rahimi"],
  ["stellv. Vorsitzender", "Talha Diş"],
  ["Kassenwart", "Someone Else"],
]);

describe("boardMismatches", () => {
  it("passes when every Vorsitz role in the CMS matches the Impressum", () => {
    expect(boardMismatches(matching)).toEqual([]);
  });

  it("skips an empty collection — that is the env-less build, not a board change", () => {
    expect(boardMismatches([])).toEqual([]);
  });

  it("reports a chair the CMS renamed", () => {
    const changed = cms([
      ["1. Vorsitzender", "Neue Vorsitzende"],
      ["stellv. Vorsitzender", "Talha Diş"],
    ]);
    expect(boardMismatches(changed)).toEqual([
      expect.stringContaining("1. Vorsitzender"),
    ]);
  });

  it("reports a Vorsitz role the CMS has and the Impressum does not", () => {
    const extra = [...matching, { role: "3. Vorsitzender", person: { name: "Dritte Person" } }];
    expect(boardMismatches(extra)).toEqual([expect.stringContaining("3. Vorsitzender")]);
  });

  it("reports an Impressum role the CMS dropped", () => {
    const dropped = cms([["1. Vorsitzender", "Kianusch Pour Rahimi"]]);
    expect(boardMismatches(dropped)).toEqual([
      expect.stringContaining("stellv. Vorsitzender"),
    ]);
  });

  it("reports a CMS entry with no person attached", () => {
    const orphan = [{ role: "1. Vorsitzender", person: null }, ...matching.slice(1)];
    expect(boardMismatches(orphan)).toEqual([expect.stringContaining("1. Vorsitzender")]);
  });

  it("names a 1. Vorsitzende(r), which the § 18 MStV line reuses", () => {
    expect(IMPRESSUM_BOARD.filter((m) => /^1\. Vorsitzende/.test(m.role))).toHaveLength(1);
  });
});
