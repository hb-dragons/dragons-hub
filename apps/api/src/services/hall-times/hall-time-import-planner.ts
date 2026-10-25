import { coverageFor } from "@dragons/shared";
import type {
  HallTimeCoverage,
  HallTimeImportBookingChange,
  HallTimeInput,
  HallTimeRow,
  HallTimeShortfall,
} from "@dragons/shared";

/** A day without a hall time reads as `uncovered` here, as it did before `none` existed. */
function importCoverage(
  window: { start: string; end: string },
  hallTime: Parameters<typeof coverageFor>[1],
): HallTimeCoverage {
  const status = coverageFor(window, hallTime).status;
  return status === "none" ? "uncovered" : status;
}

/** A booking at the venue inside the span, with the window the club would ask for. */
export interface PlannerBooking {
  id: number;
  date: string;
  effectiveStartTime: string;
  effectiveEndTime: string;
}

export interface ImportPlanInput {
  /** Stored rows of the venue inside the sheet span. */
  existing: readonly HallTimeRow[];
  rows: readonly HallTimeInput[];
  bookings: readonly PlannerBooking[];
}

export interface ImportPlan {
  span: { from: string; to: string };
  added: HallTimeInput[];
  changed: { before: HallTimeRow; after: HallTimeInput }[];
  removed: HallTimeRow[];
  unchanged: number;
  /** Row ids the apply deletes: every sheet row in the span plus manual rows the sheet overrides. */
  deleteIds: number[];
  /** Rows the apply inserts, all with source `anlage_t`. */
  inserts: HallTimeInput[];
  /** Every booking whose coverage the import changes. */
  bookings: HallTimeImportBookingChange[];
  /** The subset of `bookings` that moves out of `covered`: one event each. */
  losses: (HallTimeImportBookingChange & { after: HallTimeShortfall })[];
}

function sameEntry(a: HallTimeInput, b: HallTimeInput): boolean {
  return (
    a.kind === b.kind &&
    a.startTime === b.startTime &&
    a.endTime === b.endTime &&
    a.note === b.note
  );
}

/**
 * Pure plan of one Anlage T import, shared by preview and apply.
 *
 * The sheet is the record of the club's request for its whole span, so inside
 * `[min date, max date]` every stored sheet row is replaced by what the sheet
 * says now: a day the sheet no longer names is removed. A manual row survives
 * only on a day the sheet says nothing about — where the sheet has a value,
 * the sheet wins. Rows outside the span are not the import's business.
 */
export function planHallTimeImport(input: ImportPlanInput): ImportPlan {
  const dates = input.rows.map((r) => r.date).sort();
  const span = { from: dates[0]!, to: dates[dates.length - 1]! };

  const incomingByDate = new Map(input.rows.map((r) => [r.date, r]));
  const existingByDate = new Map(input.existing.map((r) => [r.date, r]));

  const plan: ImportPlan = {
    span,
    added: [],
    changed: [],
    removed: [],
    unchanged: 0,
    deleteIds: [],
    inserts: [],
    bookings: [],
    losses: [],
  };

  // After the import, the day → row map is the sheet plus surviving manual rows.
  const afterByDate = new Map<string, HallTimeInput>();

  for (const existing of input.existing) {
    const incoming = incomingByDate.get(existing.date);
    if (!incoming) {
      if (existing.source === "manual") {
        afterByDate.set(existing.date, existing);
        plan.unchanged++;
      } else {
        plan.removed.push(existing);
        plan.deleteIds.push(existing.id);
      }
      continue;
    }
    if (sameEntry(existing, incoming) && existing.source === "anlage_t") {
      plan.unchanged++;
      afterByDate.set(existing.date, existing);
      continue;
    }
    plan.changed.push({ before: existing, after: incoming });
    plan.deleteIds.push(existing.id);
    plan.inserts.push(incoming);
    afterByDate.set(existing.date, incoming);
  }

  for (const row of [...input.rows].sort((a, b) => a.date.localeCompare(b.date))) {
    if (existingByDate.has(row.date)) continue;
    plan.added.push(row);
    plan.inserts.push(row);
    afterByDate.set(row.date, row);
  }

  for (const booking of [...input.bookings].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)) {
    const window = { start: booking.effectiveStartTime, end: booking.effectiveEndTime };
    const before = importCoverage(window, existingByDate.get(booking.date) ?? null);
    const after = importCoverage(window, afterByDate.get(booking.date) ?? null);
    if (before === after) continue;
    const change = { bookingId: booking.id, date: booking.date, before, after };
    plan.bookings.push(change);
    if (before === "covered" && after !== "covered") {
      plan.losses.push({ ...change, after });
    }
  }

  return plan;
}
