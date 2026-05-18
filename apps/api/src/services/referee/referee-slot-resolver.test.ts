import { describe, it, expect } from "vitest";
import { isRefereeEligibleForGame, type RefereeCandidateMeta } from "./referee-slot-resolver";

const baseCandidate: RefereeCandidateMeta = {
  qualiSr1: true,
  qualiSr2: true,
  srModusMismatchSr1: false,
  srModusMismatchSr2: false,
  blocktermin: false,
  zeitraumBlockiert: null,
};

describe("isRefereeEligibleForGame", () => {
  it("returns true when slot=1 qualified and unblocked", () => {
    expect(isRefereeEligibleForGame(baseCandidate, 1)).toBe(true);
  });

  it("returns false when not qualified for slot=1", () => {
    expect(isRefereeEligibleForGame({ ...baseCandidate, qualiSr1: false }, 1)).toBe(false);
  });

  it("returns false on blocktermin", () => {
    expect(isRefereeEligibleForGame({ ...baseCandidate, blocktermin: true }, 1)).toBe(false);
  });

  it("returns false on zeitraumBlockiert", () => {
    expect(isRefereeEligibleForGame({ ...baseCandidate, zeitraumBlockiert: "Urlaub" }, 1)).toBe(false);
  });

  it("returns false on srModusMismatchSr2 for slot=2", () => {
    expect(isRefereeEligibleForGame({ ...baseCandidate, srModusMismatchSr2: true }, 2)).toBe(false);
  });

  it("returns true for slot=either when at least one slot is eligible", () => {
    expect(isRefereeEligibleForGame({ ...baseCandidate, qualiSr1: false }, "either")).toBe(true);
  });

  it("returns false for slot=either when neither slot is eligible", () => {
    expect(isRefereeEligibleForGame({ ...baseCandidate, qualiSr1: false, qualiSr2: false }, "either")).toBe(false);
  });
});
