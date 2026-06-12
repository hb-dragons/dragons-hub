import type { CandidateSearchResponse } from "@dragons/shared";

export type RefCandidate = CandidateSearchResponse["results"][number];

export type BlockReason =
  | { kind: "notQualified"; slot: 1 | 2 }
  | { kind: "modeMismatch"; slot: 1 | 2 }
  | { kind: "blocked" }
  | { kind: "zeitraum"; text: string };

const SLOT_CHECKS: Record<
  1 | 2,
  { quali: (c: RefCandidate) => boolean; mismatch: (c: RefCandidate) => boolean }
> = {
  1: { quali: (c) => c.qualiSr1, mismatch: (c) => c.srModusMismatchSr1 },
  2: { quali: (c) => c.qualiSr2, mismatch: (c) => c.srModusMismatchSr2 },
};

/**
 * Why a candidate cannot take the given slot, or null if assignable.
 * Rule order is load-bearing: qualification → srModus → blocktermin → blocked period.
 */
export function getBlockReason(candidate: RefCandidate, slot: 1 | 2): BlockReason | null {
  const checks = SLOT_CHECKS[slot];
  if (!checks.quali(candidate)) return { kind: "notQualified", slot };
  if (checks.mismatch(candidate)) return { kind: "modeMismatch", slot };
  if (candidate.blocktermin) return { kind: "blocked" };
  if (candidate.zeitraumBlockiert) return { kind: "zeitraum", text: candidate.zeitraumBlockiert };
  return null;
}
