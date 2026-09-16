// ── Hall times (Hallenzeiten) ────────────────────────────────────────────────
//
// One row per venue and club-zone day: the time window the club holds the
// hall per its Mietantrag, or the landlord's closure note for that day. Days
// the club asked for nothing have no row.

export const HALL_TIME_KINDS = ["open", "closed"] as const;
export type HallTimeKind = (typeof HALL_TIME_KINDS)[number];

export const HALL_TIME_SOURCES = ["anlage_t", "manual"] as const;
export type HallTimeSource = (typeof HALL_TIME_SOURCES)[number];

/** One day as it arrives from the sheet parser or a manual edit. */
export interface HallTimeInput {
  /** YYYY-MM-DD */
  date: string;
  kind: HallTimeKind;
  /** HH:mm; null for a closed day */
  startTime: string | null;
  /** HH:mm; null for a closed day */
  endTime: string | null;
  note: string | null;
}

export interface HallTimeRow extends HallTimeInput {
  id: number;
  venueId: number;
  source: HallTimeSource;
  createdAt: string;
  updatedAt: string;
}

/**
 * How a booking's window sits against the hall time of its day. `uncovered`
 * is also the answer when no hall time exists at all.
 */
export type HallTimeCoverage = "covered" | "partial" | "uncovered" | "closed";

/** The hall-time side of a booking, attached at read time. */
export interface BookingHallTime {
  kind: HallTimeKind;
  startTime: string | null;
  endTime: string | null;
  note: string | null;
  coverage: HallTimeCoverage;
  gapBeforeMinutes: number;
  gapAfterMinutes: number;
}

export interface HallTimeImportBookingChange {
  bookingId: number;
  date: string;
  before: HallTimeCoverage;
  after: HallTimeCoverage;
}

export interface HallTimeImportPreview {
  span: { from: string; to: string };
  added: HallTimeInput[];
  changed: { before: HallTimeRow; after: HallTimeInput }[];
  removed: HallTimeRow[];
  unchanged: number;
  bookings: HallTimeImportBookingChange[];
}

export interface HallTimeImportResult extends HallTimeImportPreview {
  eventsEmitted: number;
}
