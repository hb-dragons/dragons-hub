import { describe, expect, it } from "vitest";
import { getBlockReason, type RefCandidate } from "./candidate-block-reason";

function makeCandidate(over: Partial<RefCandidate> = {}): RefCandidate {
  return {
    srId: 1, vorname: "Tom", nachName: "Wagner", email: "", lizenznr: 88421,
    strasse: "", plz: "", ort: "", distanceKm: "0",
    qmaxSr1: null, qmaxSr2: null, warning: [],
    meta: { schiedsrichterId: 1, lizenzNr: 88421, heimTotal: 1, gastTotal: 2, total: 3, va: 0, eh: 0, qmaxSr1: null, qmaxSr2: null, tnaCount: 0, sperrvereinCount: 0, sperrzeitenCount: 0, qualiSr1: 1, qualiSr2: 1, qualiSr3: 0, qualiCoa: 0, qualiKom: 0, entfernung: 0, maxDatumBefore: null, minDatumAfter: null, anzAmTag: 0, anzInWoche: 0, anzImMonat: 0 },
    qualiSr1: true, qualiSr2: true, qualiSr3: false, qualiCoa: false, qualiKom: false,
    srModusMismatchSr1: false, srModusMismatchSr2: false,
    ansetzungAmTag: false, blocktermin: false, zeitraumBlockiert: null,
    srGruppen: [],
    ...over,
  };
}

describe("getBlockReason", () => {
  it("returns null for a fully eligible candidate (both slots)", () => {
    expect(getBlockReason(makeCandidate(), 1)).toBeNull();
    expect(getBlockReason(makeCandidate(), 2)).toBeNull();
  });

  it("flags missing SR1 qualification for slot 1", () => {
    expect(getBlockReason(makeCandidate({ qualiSr1: false }), 1)).toEqual({ kind: "notQualified", slot: 1 });
  });

  it("flags missing SR2 qualification for slot 2", () => {
    expect(getBlockReason(makeCandidate({ qualiSr2: false }), 2)).toEqual({ kind: "notQualified", slot: 2 });
  });

  it("a missing qualification only blocks its own slot", () => {
    expect(getBlockReason(makeCandidate({ qualiSr2: false }), 1)).toBeNull();
    expect(getBlockReason(makeCandidate({ qualiSr1: false }), 2)).toBeNull();
  });

  it("flags srModus mismatch per slot", () => {
    expect(getBlockReason(makeCandidate({ srModusMismatchSr1: true }), 1)).toEqual({ kind: "modeMismatch", slot: 1 });
    expect(getBlockReason(makeCandidate({ srModusMismatchSr2: true }), 2)).toEqual({ kind: "modeMismatch", slot: 2 });
    expect(getBlockReason(makeCandidate({ srModusMismatchSr2: true }), 1)).toBeNull();
  });

  it("flags blocktermin", () => {
    expect(getBlockReason(makeCandidate({ blocktermin: true }), 1)).toEqual({ kind: "blocked" });
  });

  it("returns the zeitraumBlockiert text verbatim", () => {
    expect(getBlockReason(makeCandidate({ zeitraumBlockiert: "Urlaub bis 20.06." }), 2)).toEqual({ kind: "zeitraum", text: "Urlaub bis 20.06." });
  });

  it("qualification outranks blocktermin (rule precedence)", () => {
    expect(getBlockReason(makeCandidate({ qualiSr1: false, blocktermin: true }), 1)).toEqual({ kind: "notQualified", slot: 1 });
  });

  it("modus mismatch outranks zeitraumBlockiert (rule precedence)", () => {
    expect(getBlockReason(makeCandidate({ srModusMismatchSr1: true, zeitraumBlockiert: "x" }), 1)).toEqual({ kind: "modeMismatch", slot: 1 });
  });
});
