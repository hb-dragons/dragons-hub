import type { CandidateSearchResponse } from "@dragons/shared";
import type { RouteParam } from "@/lib/nav/route-params";

/**
 * Reading a federation candidate list (issue #223).
 *
 * The assignment sheet asks the federation for referees eligible for one slot
 * of one game and gets them back ranked, each with a distance to the venue.
 * Distance is what the list is grouped by — an assigner picks the nearest
 * qualified official they can — so the bracket thresholds and the section
 * order are the sheet's actual subject matter, and they live here where they
 * can be read without a live federation session.
 */

export type RefCandidate = CandidateSearchResponse["results"][number];

/** Nearest first: under 20 km, under 30 km, everything beyond. */
export type DistanceBracket = "close" | "med" | "far";

const BRACKET_ORDER: readonly DistanceBracket[] = ["close", "med", "far"];

const CLOSE_MAX_KM = 20;
const MED_MAX_KM = 30;

/**
 * Which bracket a federation distance falls in.
 *
 * `distanceKm` arrives as the federation prints it — German notation, so
 * "12,5" and not "12.5". An unparseable value (the federation sends a few) is
 * bracketed `far` rather than dropped: an assigner needs to see that the
 * referee exists, and "we do not know how far" is closer to far than to near.
 */
export function distanceBracket(distanceKm: string): DistanceBracket {
  const km = Number.parseFloat(distanceKm.replace(",", "."));
  if (!Number.isFinite(km)) return "far";
  if (km < CLOSE_MAX_KM) return "close";
  if (km < MED_MAX_KM) return "med";
  return "far";
}

export interface CandidateSection {
  key: DistanceBracket;
  data: RefCandidate[];
}

/**
 * The candidates as sections, nearest bracket first, empty brackets left out.
 *
 * Order *within* a bracket is the order the federation returned — that is its
 * own ranking, and re-sorting by distance would discard it.
 */
export function groupByDistance(candidates: readonly RefCandidate[]): CandidateSection[] {
  const buckets: Record<DistanceBracket, RefCandidate[]> = { close: [], med: [], far: [] };
  for (const candidate of candidates) {
    buckets[distanceBracket(candidate.distanceKm)].push(candidate);
  }
  return BRACKET_ORDER.filter((key) => buckets[key].length > 0).map((key) => ({
    key,
    data: buckets[key],
  }));
}

/** Avatar initials. Either name may be empty in the federation's data. */
export function candidateInitials(candidate: RefCandidate): string {
  const first = candidate.vorname.charAt(0);
  const last = candidate.nachName.charAt(0);
  return `${first}${last}`.toUpperCase();
}

/**
 * Which swatch of an avatar palette a name gets.
 *
 * A name has to keep its colour across re-renders and re-searches, so the
 * choice is derived from the name rather than from the row's position: the
 * same referee is the same colour whether they come back first or twelfth.
 */
export function paletteIndexFor(key: string, optionCount: number): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash + key.charCodeAt(i)) | 0;
  return Math.abs(hash) % optionCount;
}

/** The federation's name for a slot, shown in the sheet's title and alerts. */
export function slotLabel(slot: 1 | 2): "SR1" | "SR2" {
  return slot === 1 ? "SR1" : "SR2";
}

/**
 * The slot a sheet route was opened for. Anything that is not a slot reads as
 * SR1 — the sheet has to name *some* slot, and every game has a first one.
 */
export function parseSlotParam(param: RouteParam): 1 | 2 {
  const value = Array.isArray(param) ? param[0] : param;
  return value === "2" ? 2 : 1;
}
