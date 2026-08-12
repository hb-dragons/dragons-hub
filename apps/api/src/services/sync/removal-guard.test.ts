import { describe, expect, it } from "vitest";

import {
  MASS_REMOVAL_FLOOR,
  MASS_REMOVAL_RATIO,
  MIN_FETCH_COVERAGE,
  assessGameDetailCoverage,
  evaluateFetchCoverage,
  evaluatePageCompleteness,
  evaluateRemovalBlastRadius,
  isUsableGameDetail,
} from "./removal-guard";
import type { LeagueFetchedData } from "./data-fetcher";
import type { SdkGetGameResponse, SdkSpielplanMatch } from "@dragons/sdk";

function slot(assigned: boolean) {
  return {
    spielleitung: assigned
      ? ({ spielleitungId: 1, schirirolle: { schirirolleId: 1 } } as never)
      : null,
    lizenzNr: null,
    offenAngeboten: !assigned,
  };
}

function gameDetail(matchApiId: number, assigned = true): SdkGetGameResponse {
  return {
    game1: { spielplanId: matchApiId } as SdkGetGameResponse["game1"],
    sr1: slot(assigned),
    sr2: slot(false),
    sr3: slot(false),
  } as SdkGetGameResponse;
}

function spielplanOf(matchIds: number[]): SdkSpielplanMatch[] {
  return matchIds.map((matchId) => ({ matchId }) as SdkSpielplanMatch);
}

function league(
  leagueApiId: number,
  requestedMatchIds: number[],
  returnedMatchIds: number[],
): LeagueFetchedData {
  return {
    leagueApiId,
    leagueDbId: leagueApiId,
    leagueName: `L${leagueApiId}`,
    seasonRefId: null,
    seasonStatus: "active",
    vorabliga: false,
    spielplan: spielplanOf(requestedMatchIds),
    tabelle: [],
    gameDetails: new Map(returnedMatchIds.map((id) => [id, gameDetail(id)])),
  };
}

describe("isUsableGameDetail", () => {
  it("accepts a payload carrying game1 plus all three referee slots", () => {
    expect(isUsableGameDetail(gameDetail(1))).toBe(true);
  });

  it("rejects a payload whose referee slots were truncated away", () => {
    const truncated = { game1: { spielplanId: 1 } } as unknown;
    expect(isUsableGameDetail(truncated)).toBe(false);
  });

  it("rejects a payload missing a single referee slot", () => {
    const partial = { ...gameDetail(1), sr3: undefined } as unknown;
    expect(isUsableGameDetail(partial)).toBe(false);
  });

  it("rejects a slot that is not an object with offenAngeboten", () => {
    const bad = { ...gameDetail(1), sr2: {} } as unknown;
    expect(isUsableGameDetail(bad)).toBe(false);
  });

  it("accepts a slot with an explicitly null spielleitung (the empty-slot signal)", () => {
    expect(isUsableGameDetail(gameDetail(1, false))).toBe(true);
  });

  it("rejects null / non-objects", () => {
    expect(isUsableGameDetail(null)).toBe(false);
    expect(isUsableGameDetail(undefined)).toBe(false);
    expect(isUsableGameDetail("{}")).toBe(false);
  });

  it("rejects a payload with no game1 object", () => {
    expect(isUsableGameDetail({ sr1: slot(false), sr2: slot(false), sr3: slot(false) })).toBe(false);
    expect(isUsableGameDetail({ game1: null, sr1: slot(false) })).toBe(false);
  });

  it("rejects a slot that omits the spielleitung key entirely", () => {
    const noSpielleitung = {
      game1: { spielplanId: 1 },
      sr1: { offenAngeboten: true, lizenzNr: null },
      sr2: slot(false),
      sr3: slot(false),
    };
    expect(isUsableGameDetail(noSpielleitung)).toBe(false);
  });
});

describe("assessGameDetailCoverage", () => {
  it("counts every spielplan match as requested and every usable detail as observed", () => {
    const data = [league(1, [10, 11, 12], [10, 11, 12])];
    const { coverage, observedMatchApiIds } = assessGameDetailCoverage(data);
    expect(coverage).toEqual({ requested: 3, observed: 3 });
    expect([...observedMatchApiIds].sort()).toEqual([10, 11, 12]);
  });

  it("does not mark a match observed when its detail fetch failed", () => {
    const data = [league(1, [10, 11, 12], [10])];
    const { coverage, observedMatchApiIds } = assessGameDetailCoverage(data);
    expect(coverage).toEqual({ requested: 3, observed: 1 });
    expect(observedMatchApiIds.has(11)).toBe(false);
    expect(observedMatchApiIds.has(12)).toBe(false);
  });

  it("does not mark a match observed when its detail payload is truncated", () => {
    const data = [league(1, [10, 11], [10, 11])];
    data[0]!.gameDetails.set(11, { game1: {} } as SdkGetGameResponse);
    const { coverage, observedMatchApiIds } = assessGameDetailCoverage(data);
    expect(coverage).toEqual({ requested: 2, observed: 1 });
    expect(observedMatchApiIds.has(11)).toBe(false);
  });

  it("ignores spielplan rows with no usable matchId", () => {
    const data = [league(1, [10], [10])];
    data[0]!.spielplan.push({ matchId: 0 } as SdkSpielplanMatch);
    data[0]!.spielplan.push({} as SdkSpielplanMatch);
    expect(assessGameDetailCoverage(data).coverage).toEqual({ requested: 1, observed: 1 });
  });

  it("aggregates across leagues", () => {
    const data = [league(1, [10, 11], [10, 11]), league(2, [20, 21], [20])];
    expect(assessGameDetailCoverage(data).coverage).toEqual({ requested: 4, observed: 3 });
  });
});

describe("evaluateFetchCoverage", () => {
  it("blocks removals when the run fetched nothing at all", () => {
    const gate = evaluateFetchCoverage({ requested: 0, observed: 0 });
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/no matches/i);
  });

  it("blocks removals when every detail fetch failed", () => {
    const gate = evaluateFetchCoverage({ requested: 50, observed: 0 });
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/coverage/i);
  });

  it("blocks removals on a truncated fetch (this is the data-loss case)", () => {
    // 200 matches requested, only 20 details came back — a truncated or
    // rate-limited response must never read as "180 assignments were removed".
    const gate = evaluateFetchCoverage({ requested: 200, observed: 20 });
    expect(gate.allowed).toBe(false);
  });

  it("blocks removals just below the coverage floor", () => {
    const requested = 100;
    const observed = Math.floor(MIN_FETCH_COVERAGE * requested) - 1;
    expect(evaluateFetchCoverage({ requested, observed }).allowed).toBe(false);
  });

  it("allows removals on a complete fetch", () => {
    const gate = evaluateFetchCoverage({ requested: 120, observed: 120 });
    expect(gate.allowed).toBe(true);
    expect(gate.reason).toBeNull();
  });

  it("allows removals when a handful of details failed but coverage holds", () => {
    expect(evaluateFetchCoverage({ requested: 100, observed: 95 }).allowed).toBe(true);
  });

  it("never allows removals when observed exceeds requested (impossible input)", () => {
    expect(evaluateFetchCoverage({ requested: 5, observed: 9 }).allowed).toBe(false);
  });

  it("rejects negative counters rather than dividing its way to a pass", () => {
    expect(evaluateFetchCoverage({ requested: -1, observed: -1 }).allowed).toBe(false);
  });

  it("rejects non-finite counters", () => {
    expect(evaluateFetchCoverage({ requested: Number.NaN, observed: 5 }).allowed).toBe(false);
    expect(evaluateFetchCoverage({ requested: 5, observed: Number.POSITIVE_INFINITY }).allowed).toBe(
      false,
    );
  });
});

describe("evaluatePageCompleteness", () => {
  it("allows removals when every declared row was paged in", () => {
    const gate = evaluatePageCompleteness(340, 340);
    expect(gate.allowed).toBe(true);
    expect(gate.reason).toBeNull();
  });

  it("blocks removals when pagination stopped short of the declared total", () => {
    const gate = evaluatePageCompleteness(340, 200);
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/200 of 340/);
  });

  it("blocks removals when a single row is missing", () => {
    expect(evaluatePageCompleteness(340, 339).allowed).toBe(false);
  });

  it("blocks removals when the feed declared nothing", () => {
    expect(evaluatePageCompleteness(0, 0).allowed).toBe(false);
  });

  it("blocks removals when more rows arrived than were declared", () => {
    expect(evaluatePageCompleteness(10, 11).allowed).toBe(false);
  });

  it("blocks removals on a non-finite total", () => {
    expect(evaluatePageCompleteness(Number.NaN, 5).allowed).toBe(false);
  });
});

describe("evaluateRemovalBlastRadius", () => {
  it("allows a small removal even when it is proportionally large", () => {
    expect(evaluateRemovalBlastRadius(2, 3).allowed).toBe(true);
  });

  it("allows a large removal that stays under the ratio", () => {
    expect(evaluateRemovalBlastRadius(20, 100).allowed).toBe(true);
  });

  it("blocks a mass removal above both the floor and the ratio", () => {
    const live = 100;
    const candidates = Math.ceil(MASS_REMOVAL_RATIO * live) + 1;
    const gate = evaluateRemovalBlastRadius(candidates, live);
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/mass removal/i);
  });

  it("blocks wiping every live assignment", () => {
    expect(evaluateRemovalBlastRadius(500, 500).allowed).toBe(false);
  });

  it("does not trip on removals at or below the floor", () => {
    expect(evaluateRemovalBlastRadius(MASS_REMOVAL_FLOOR, MASS_REMOVAL_FLOOR).allowed).toBe(true);
  });

  it("is a no-op when there is nothing to remove", () => {
    expect(evaluateRemovalBlastRadius(0, 0).allowed).toBe(true);
  });

  it("blocks a removal set larger than the floor when nothing is live", () => {
    const gate = evaluateRemovalBlastRadius(MASS_REMOVAL_FLOOR + 1, 0);
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/no live rows/);
  });
});
