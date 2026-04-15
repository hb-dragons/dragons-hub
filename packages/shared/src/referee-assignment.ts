import type { SdkRefCandidate } from "@dragons/sdk";

export interface AssignRefereeBody {
  slotNumber: 1 | 2;
  refereeApiId: number;
}

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
