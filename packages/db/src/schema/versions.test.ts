import { describe, expect, it } from "vitest";
import {
  isLegacySnapshot,
  type CurrentRemoteSnapshot,
  type LegacyRemoteSnapshot,
} from "./versions";

const legacy: LegacyRemoteSnapshot = {
  matchNo: 12,
  matchDay: 3,
  kickoffDate: "2026-03-14",
  kickoffTime: "18:00",
  leagueId: 47,
  homeTeamApiId: 100,
  guestTeamApiId: 200,
  venueApiId: 9,
  isConfirmed: true,
  isForfeited: false,
  isCancelled: false,
  homeScore: 63,
  guestScore: 61,
  homeHalftimeScore: 30,
  guestHalftimeScore: 29,
  quarterScores: { q1Home: 15, q1Guest: 14 },
  overtimeScores: null,
};

const current: CurrentRemoteSnapshot = {
  matchNo: 12,
  matchDay: 3,
  kickoffDate: "2026-03-14",
  kickoffTime: "18:00",
  leagueId: 47,
  homeTeamApiId: 100,
  guestTeamApiId: 200,
  venueApiId: 9,
  isConfirmed: true,
  isForfeited: false,
  isCancelled: false,
  homeScore: 63,
  guestScore: 61,
  homeHalftimeScore: 30,
  guestHalftimeScore: 29,
  periodFormat: "quarters",
  homeQ1: 15,
  guestQ1: 14,
  homeQ2: 15,
  guestQ2: 15,
  homeQ3: 16,
  guestQ3: 16,
  homeQ4: 17,
  guestQ4: 16,
  homeQ5: null,
  guestQ5: null,
  homeQ6: null,
  guestQ6: null,
  homeQ7: null,
  guestQ7: null,
  homeQ8: null,
  guestQ8: null,
  homeOt1: null,
  guestOt1: null,
  homeOt2: null,
  guestOt2: null,
};

describe("isLegacySnapshot", () => {
  it("accepts a pre-0005 snapshot", () => {
    expect(isLegacySnapshot(legacy)).toBe(true);
  });

  it("rejects a post-0005 snapshot with typed period columns", () => {
    // The discriminator's whole job: a current snapshot must never be read
    // through the legacy shape, or homeQ1..homeOt2 get thrown away.
    expect(isLegacySnapshot(current)).toBe(false);
  });

  it("accepts a legacy row whose quarterScores were stored as null", () => {
    // quarterScores is nullable in the legacy shape, so key presence — not
    // truthiness — has to be what decides.
    expect(isLegacySnapshot({ ...legacy, quarterScores: null })).toBe(true);
  });

  it("accepts a legacy row whose quarterScores object is empty", () => {
    expect(isLegacySnapshot({ ...legacy, quarterScores: {} })).toBe(true);
  });

  it("rejects null and undefined", () => {
    expect(isLegacySnapshot(null)).toBe(false);
    expect(isLegacySnapshot(undefined)).toBe(false);
  });

  it("rejects primitives, including ones that would throw on `in`", () => {
    // `"quarterScores" in 0` is a TypeError, so the typeof guard has to come
    // first. These cases exist to keep that ordering.
    expect(isLegacySnapshot(0)).toBe(false);
    expect(isLegacySnapshot(1)).toBe(false);
    expect(isLegacySnapshot("")).toBe(false);
    expect(isLegacySnapshot("quarterScores")).toBe(false);
    expect(isLegacySnapshot(JSON.stringify(legacy))).toBe(false);
    expect(isLegacySnapshot(true)).toBe(false);
    expect(isLegacySnapshot(false)).toBe(false);
    expect(isLegacySnapshot(Symbol("quarterScores"))).toBe(false);
    expect(isLegacySnapshot(10n)).toBe(false);
  });

  it("rejects empty and unrelated objects", () => {
    expect(isLegacySnapshot({})).toBe(false);
    expect(isLegacySnapshot({ matchNo: 12 })).toBe(false);
    expect(isLegacySnapshot(Object.create(null))).toBe(false);
  });

  it("rejects arrays and functions", () => {
    expect(isLegacySnapshot([])).toBe(false);
    expect(isLegacySnapshot([legacy])).toBe(false);
    // A function is not `typeof "object"`, so it is rejected even carrying the key.
    const fn = Object.assign(() => undefined, { quarterScores: null });
    expect(isLegacySnapshot(fn)).toBe(false);
  });

  it("is a key-presence check, not a shape check", () => {
    // Documented limitation: the predicate discriminates between the two
    // known snapshot formats and nothing more. It claims
    // `snapshot is LegacyRemoteSnapshot` for any object carrying the key, so
    // callers must not treat it as validation of untrusted input.
    expect(isLegacySnapshot({ quarterScores: undefined })).toBe(true);
    expect(isLegacySnapshot({ quarterScores: "not a score map" })).toBe(true);
    expect(isLegacySnapshot(Object.create({ quarterScores: null }))).toBe(true);
  });
});
