import type { LeagueFetchedData } from "./data-fetcher";

/**
 * Removal semantics for entities that vanish from the federation feed (issue #105).
 *
 * Absence from a feed is only evidence of removal when the fetch that produced
 * that absence is verifiably complete. A truncated, rate-limited or partially
 * failed response looks exactly like "everything was removed", so every removal
 * pass has to pass three independent gates before it may touch a row:
 *
 *  1. Per-entity evidence — the entity's own payload came back and is
 *     structurally intact (`isUsableGameDetail`). An entity we never heard back
 *     about is never a removal candidate, no matter how healthy the run looks.
 *  2. Run coverage — enough of what we asked for came back
 *     (`evaluateFetchCoverage`). Below the floor the whole run is treated as
 *     degraded and no removals happen at all.
 *  3. Blast radius — the removal set is not implausibly large relative to what
 *     is live (`evaluateRemovalBlastRadius`), a circuit breaker against a feed
 *     that answers 200 OK with a plausible-looking but wrong body.
 */

/** Fraction of requested entities that must come back before removals are considered. */
export const MIN_FETCH_COVERAGE = 0.9;

/** Removal sets at or below this size never trip the blast-radius breaker. */
export const MASS_REMOVAL_FLOOR = 10;

/** Above the floor, a removal set may not exceed this fraction of the live rows. */
export const MASS_REMOVAL_RATIO = 0.5;

export interface FetchCoverage {
  /** How many entities this run asked the federation for. */
  requested: number;
  /** How many came back with a structurally usable payload. */
  observed: number;
}

export interface RemovalGate {
  allowed: boolean;
  reason: string | null;
}

const ALLOWED: RemovalGate = { allowed: true, reason: null };

function blocked(reason: string): RemovalGate {
  return { allowed: false, reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * True when a game-details payload carries enough structure for its *absence*
 * of a referee to mean something. A slot with `spielleitung: null` is the
 * federation saying "nobody is on this slot"; a payload with no `sr1` key at
 * all is the transport saying "I did not finish".
 */
export function isUsableGameDetail(details: unknown): boolean {
  if (!isRecord(details)) return false;
  if (!isRecord(details.game1)) return false;

  for (const slotKey of ["sr1", "sr2", "sr3"] as const) {
    const slot = details[slotKey];
    if (!isRecord(slot)) return false;
    if (typeof slot.offenAngeboten !== "boolean") return false;
    if (!("spielleitung" in slot)) return false;
  }

  return true;
}

/**
 * Reduce a run's fetched league data to (a) how complete the game-detail fetch
 * was and (b) exactly which matches we have first-hand referee evidence for.
 *
 * `requested` comes from the Spielplan, which is what `fetchLeagueData` feeds
 * into `getGameDetailsBatch`; that batch swallows per-match failures, so a
 * short `gameDetails` map is the only signal that details went missing.
 */
export function assessGameDetailCoverage(leagueData: LeagueFetchedData[]): {
  coverage: FetchCoverage;
  observedMatchApiIds: Set<number>;
} {
  const requestedMatchApiIds = new Set<number>();
  const observedMatchApiIds = new Set<number>();

  for (const data of leagueData) {
    for (const match of data.spielplan) {
      if (typeof match.matchId === "number" && match.matchId > 0) {
        requestedMatchApiIds.add(match.matchId);
      }
    }
    for (const [matchApiId, details] of data.gameDetails) {
      if (isUsableGameDetail(details)) {
        observedMatchApiIds.add(matchApiId);
      }
    }
  }

  return {
    coverage: { requested: requestedMatchApiIds.size, observed: observedMatchApiIds.size },
    observedMatchApiIds,
  };
}

/**
 * Gate 2 — did enough of the run come back to trust any absence at all?
 */
export function evaluateFetchCoverage(coverage: FetchCoverage): RemovalGate {
  const { requested, observed } = coverage;

  if (!Number.isFinite(requested) || !Number.isFinite(observed)) {
    return blocked("fetch coverage counters are not finite");
  }
  if (requested <= 0) {
    return blocked("no matches were requested from the federation, so nothing can be proven absent");
  }
  if (observed < 0 || observed > requested) {
    return blocked(
      `implausible fetch coverage: observed ${observed} of ${requested} requested`,
    );
  }

  const ratio = observed / requested;
  if (ratio < MIN_FETCH_COVERAGE) {
    return blocked(
      `fetch coverage ${(ratio * 100).toFixed(1)}% (${observed}/${requested}) is below the ${(
        MIN_FETCH_COVERAGE * 100
      ).toFixed(0)}% floor — treating the fetch as partial`,
    );
  }

  return ALLOWED;
}

/**
 * Gate 2, paginated variant — for feeds that declare a row count up front
 * (`offenespiele` returns `total` alongside each page). Anything short of the
 * declared total means a page went missing, and a missing page is
 * indistinguishable from "those games were withdrawn".
 */
export function evaluatePageCompleteness(total: number, received: number): RemovalGate {
  if (!Number.isFinite(total) || !Number.isFinite(received)) {
    return blocked("page counters are not finite");
  }
  if (total <= 0) {
    return blocked("feed declared no rows, so nothing can be proven absent");
  }
  if (received !== total) {
    return blocked(
      `incomplete pagination: received ${received} of ${total} declared rows`,
    );
  }
  return ALLOWED;
}

/**
 * Gate 3 — circuit breaker. A complete-looking fetch that would wipe most of
 * what we hold is far more likely to be a bad feed than a real mass withdrawal.
 */
export function evaluateRemovalBlastRadius(candidates: number, liveTotal: number): RemovalGate {
  if (candidates <= 0) return ALLOWED;
  if (candidates <= MASS_REMOVAL_FLOOR) return ALLOWED;
  if (liveTotal <= 0) {
    return blocked(`mass removal blocked: ${candidates} candidates against no live rows`);
  }

  const ratio = candidates / liveTotal;
  if (ratio > MASS_REMOVAL_RATIO) {
    return blocked(
      `mass removal blocked: ${candidates} of ${liveTotal} live rows (${(ratio * 100).toFixed(
        1,
      )}%) exceeds the ${(MASS_REMOVAL_RATIO * 100).toFixed(0)}% ceiling`,
    );
  }

  return ALLOWED;
}
