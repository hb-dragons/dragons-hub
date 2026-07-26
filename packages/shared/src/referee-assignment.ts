import type { SdkRefCandidate } from "@dragons/sdk";

// The request body type lives in `@dragons/contracts` as `RefereeAssignBody`
// (referee-self.ts), inferred from the zod schema the route validates with.

export interface AssignRefereeResponse {
  success: true;
  slot: "sr1" | "sr2";
  status: "assigned";
  refereeName: string;
}

export interface UnassignRefereeResponse {
  success: true;
  slot: "sr1" | "sr2";
  status: "open";
}

export interface CandidateSearchResponse {
  total: number;
  results: SdkRefCandidate[];
}
