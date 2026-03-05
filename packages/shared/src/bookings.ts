import type { BookingStatus } from "./constants";

// ── Reconcile preview types ─────────────────────────────────────────────────

export interface ReconcilePreviewMatch {
  id: number;
  homeTeam: string;
  homeTeamCustomName: string | null;
  guestTeam: string;
  kickoffTime: string;
  isForfeited: boolean;
  isCancelled: boolean;
}

export interface ReconcilePreviewCreate {
  venueName: string;
  date: string;
  calculatedStartTime: string;
  calculatedEndTime: string;
  matches: ReconcilePreviewMatch[];
}

export interface ReconcilePreviewUpdate {
  bookingId: number;
  venueName: string;
  date: string;
  status: BookingStatus;
  currentStartTime: string;
  currentEndTime: string;
  newStartTime: string;
  newEndTime: string;
  matchesAdded: ReconcilePreviewMatch[];
  matchesRemoved: ReconcilePreviewMatch[];
}

export interface ReconcilePreviewRemove {
  bookingId: number;
  venueName: string;
  date: string;
  status: BookingStatus;
  reason: "all_matches_cancelled" | "no_matches";
  matches: ReconcilePreviewMatch[];
}

export interface ReconcilePreview {
  toCreate: ReconcilePreviewCreate[];
  toUpdate: ReconcilePreviewUpdate[];
  toRemove: ReconcilePreviewRemove[];
  unchanged: number;
}

export interface ReconcileResult {
  created: number;
  updated: number;
  removed: number;
  unchanged: number;
}

// ── Booking types ───────────────────────────────────────────────────────────

export interface BookingMatch {
  id: number;
  matchNo: number;
  kickoffDate: string;
  kickoffTime: string;
  homeTeam: string;
  homeTeamCustomName: string | null;
  guestTeam: string;
  leagueName: string | null;
}

export interface BookingListItem {
  id: number;
  venueId: number;
  venueName: string;
  date: string;
  calculatedStartTime: string;
  calculatedEndTime: string;
  overrideStartTime: string | null;
  overrideEndTime: string | null;
  effectiveStartTime: string;
  effectiveEndTime: string;
  status: BookingStatus;
  needsReconfirmation: boolean;
  notes: string | null;
  matchCount: number;
}

export interface BookingDetail {
  id: number;
  venueId: number;
  venueName: string;
  date: string;
  calculatedStartTime: string;
  calculatedEndTime: string;
  overrideStartTime: string | null;
  overrideEndTime: string | null;
  overrideReason: string | null;
  effectiveStartTime: string;
  effectiveEndTime: string;
  status: BookingStatus;
  needsReconfirmation: boolean;
  notes: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  matches: BookingMatch[];
}
