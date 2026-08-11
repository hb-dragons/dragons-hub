import { describe, expect, it } from "vitest";
import type { CandidateSearchResponse } from "@dragons/shared";

import {
  candidateInitials,
  distanceBracket,
  groupByDistance,
  paletteIndexFor,
  parseSlotParam,
  slotLabel,
} from "@/lib/referee/candidates";

/**
 * The referee-assignment sheet's reading of a candidate list (issue #223).
 *
 * All of this used to sit inline in `AssignRefereeModal`, where the only way to
 * find out that a federation distance of "20,0" lands in the middle bracket was
 * to run the app against a live federation search.
 */

type Candidate = CandidateSearchResponse["results"][number];

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    srId: 1,
    vorname: "Anna",
    nachName: "Berg",
    email: "anna@example.de",
    lizenznr: 1,
    strasse: "",
    plz: "",
    ort: "Hamburg",
    distanceKm: "5,0",
    qmaxSr1: null,
    qmaxSr2: null,
    warning: [],
    meta: {} as Candidate["meta"],
    qualiSr1: true,
    qualiSr2: true,
    qualiSr3: false,
    qualiCoa: false,
    qualiKom: false,
    srModusMismatchSr1: false,
    srModusMismatchSr2: false,
    ansetzungAmTag: false,
    blocktermin: false,
    zeitraumBlockiert: null,
    srGruppen: [],
    ...overrides,
  };
}

describe("distanceBracket", () => {
  // The federation reports kilometres in German notation, so the decimal
  // separator is a comma. Parsing it as-is yields NaN for anything past the
  // separator — "9,9" would read as 9 and "19,9" as 19, which is only ever
  // *nearly* right and never obviously wrong.
  it("reads the federation's comma as a decimal point", () => {
    expect(distanceBracket("19,9")).toBe("close");
    expect(distanceBracket("29,9")).toBe("med");
  });

  it("brackets by the two thresholds the sections are drawn from", () => {
    expect(distanceBracket("0")).toBe("close");
    expect(distanceBracket("20")).toBe("med");
    expect(distanceBracket("30")).toBe("far");
    expect(distanceBracket("120,5")).toBe("far");
  });

  // A candidate whose distance the federation could not compute still has to
  // appear — the last section is the honest place for an unknown distance.
  it("puts an unparseable distance in the far bracket rather than dropping it", () => {
    expect(distanceBracket("")).toBe("far");
    expect(distanceBracket("k. A.")).toBe("far");
  });
});

describe("groupByDistance", () => {
  it("orders the sections nearest first", () => {
    const sections = groupByDistance([
      candidate({ srId: 1, distanceKm: "45,0" }),
      candidate({ srId: 2, distanceKm: "5,0" }),
      candidate({ srId: 3, distanceKm: "25,0" }),
    ]);

    expect(sections.map((section) => section.key)).toEqual(["close", "med", "far"]);
    expect(sections.map((section) => section.data.map((c) => c.srId))).toEqual([[2], [3], [1]]);
  });

  it("leaves out a bracket nobody falls into", () => {
    const sections = groupByDistance([candidate({ distanceKm: "5,0" })]);

    expect(sections.map((section) => section.key)).toEqual(["close"]);
  });

  it("keeps the search order within a bracket", () => {
    const sections = groupByDistance([
      candidate({ srId: 7, distanceKm: "9,0" }),
      candidate({ srId: 8, distanceKm: "1,0" }),
    ]);

    // The federation ranks its results; re-sorting them by distance inside a
    // bracket would throw that ranking away.
    expect(sections[0]?.data.map((c) => c.srId)).toEqual([7, 8]);
  });

  it("has nothing to show for an empty result set", () => {
    expect(groupByDistance([])).toEqual([]);
  });
});

describe("candidateInitials", () => {
  it("takes one letter from each name, upper-cased", () => {
    expect(candidateInitials(candidate({ vorname: "anna", nachName: "berg" }))).toBe("AB");
  });

  it("copes with a name the federation left empty", () => {
    expect(candidateInitials(candidate({ vorname: "", nachName: "Berg" }))).toBe("B");
    expect(candidateInitials(candidate({ vorname: "", nachName: "" }))).toBe("");
  });
});

describe("paletteIndexFor", () => {
  it("gives one referee the same swatch every time the list is rebuilt", () => {
    expect(paletteIndexFor("AnnaBerg", 4)).toBe(paletteIndexFor("AnnaBerg", 4));
  });

  it("stays inside the palette, whatever the name", () => {
    for (const name of ["", "Ø", "AnnaBerg", "a".repeat(500)]) {
      const index = paletteIndexFor(name, 4);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(4);
      expect(Number.isInteger(index)).toBe(true);
    }
  });

  it("spreads different names across the palette", () => {
    const names = ["AnnaBerg", "BenCarl", "ClaraDorn", "DirkEnge", "EvaFuchs", "FelixGrau"];
    expect(new Set(names.map((name) => paletteIndexFor(name, 4))).size).toBeGreaterThan(1);
  });
});

describe("slotLabel", () => {
  it("names the two referee slots the way the federation does", () => {
    expect(slotLabel(1)).toBe("SR1");
    expect(slotLabel(2)).toBe("SR2");
  });
});

describe("parseSlotParam", () => {
  it("reads the slot the opening screen passed", () => {
    expect(parseSlotParam("1")).toBe(1);
    expect(parseSlotParam("2")).toBe(2);
  });

  // The param arrives from a URL, so it can be anything. Assigning SR1 is the
  // safe reading: it is the slot every game has.
  it("falls back to SR1 for anything that is not a slot", () => {
    expect(parseSlotParam("3")).toBe(1);
    expect(parseSlotParam("sr2")).toBe(1);
    expect(parseSlotParam(undefined)).toBe(1);
    expect(parseSlotParam(["2", "1"])).toBe(2);
  });
});
