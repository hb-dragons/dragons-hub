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
export interface HallTimeInput extends HallTimeWindow {
  /** YYYY-MM-DD */
  date: string;
}

export interface HallTimeRow extends HallTimeInput {
  id: number;
  venueId: number;
  source: HallTimeSource;
  createdAt: string;
  updatedAt: string;
}

export const HALL_TIME_COVERAGES = ["covered", "partial", "uncovered", "closed", "none"] as const;

/**
 * How a window sits against the hall time of its day. `uncovered` means a
 * hall time exists but the window misses it; `none` means the day has no
 * hall time at all.
 */
export type HallTimeCoverage = (typeof HALL_TIME_COVERAGES)[number];

/** A coverage that still owes the city a request: everything but `covered`. */
export type HallTimeShortfall = Exclude<HallTimeCoverage, "covered">;

/** The four facts a hall time carries wherever it is shown or published. */
export interface HallTimeWindow {
  kind: HallTimeKind;
  startTime: string | null;
  endTime: string | null;
  note: string | null;
}

/** The hall-time side of a window, attached at read time. */
export interface HallCoverageInfo {
  hallTime: HallTimeWindow | null;
  coverage: HallTimeCoverage;
  gapBeforeMinutes: number;
  gapAfterMinutes: number;
}

/** @deprecated Replaced by HallCoverageInfo; removed in Task 8. */
export interface BookingHallTime extends HallTimeWindow {
  coverage: HallTimeCoverage;
  gapBeforeMinutes: number;
  gapAfterMinutes: number;
}

export interface HallTimeImportPreview {
  span: { from: string; to: string };
  added: HallTimeInput[];
  changed: { before: HallTimeRow; after: HallTimeInput }[];
  removed: HallTimeRow[];
  unchanged: number;
}

/** Applying an import reports the same diff the preview showed. */
export type HallTimeImportResult = HallTimeImportPreview;
