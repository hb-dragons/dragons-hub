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
