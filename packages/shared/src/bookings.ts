import type { BookingStatus } from "./constants";

export interface BookingMatch {
  id: number;
  matchNo: number;
  kickoffDate: string;
  kickoffTime: string;
  homeTeam: string;
  guestTeam: string;
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
  task: { id: number; title: string } | null;
}

export interface BookingDetailTask {
  id: number;
  title: string;
  columnName: string;
  status: string;
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
  task: BookingDetailTask | null;
}

/** Subset used when showing booking info on task detail */
export interface BookingInfo {
  id: number;
  venueName: string;
  date: string;
  effectiveStartTime: string;
  effectiveEndTime: string;
  status: BookingStatus;
  needsReconfirmation: boolean;
  matches: BookingMatch[];
}
