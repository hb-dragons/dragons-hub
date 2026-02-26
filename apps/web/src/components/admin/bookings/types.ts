export interface BookingListItem {
  id: number;
  date: string;
  venueName: string;
  effectiveStartTime: string | null;
  effectiveEndTime: string | null;
  matchCount: number;
  status: "pending" | "requested" | "confirmed" | "cancelled";
  needsReconfirmation: boolean;
}
