import type { HallTimeInput, HallTimeRow } from "@dragons/shared";

export interface ImportPlanInput {
  /** Stored rows of the venue inside the sheet span. */
  existing: readonly HallTimeRow[];
  rows: readonly HallTimeInput[];
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
  };

  for (const existing of input.existing) {
    const incoming = incomingByDate.get(existing.date);
    if (!incoming) {
      if (existing.source === "manual") {
        plan.unchanged++;
      } else {
        plan.removed.push(existing);
        plan.deleteIds.push(existing.id);
      }
      continue;
    }
    if (sameEntry(existing, incoming) && existing.source === "anlage_t") {
      plan.unchanged++;
      continue;
    }
    plan.changed.push({ before: existing, after: incoming });
    plan.deleteIds.push(existing.id);
    plan.inserts.push(incoming);
  }

  for (const row of [...input.rows].sort((a, b) => a.date.localeCompare(b.date))) {
    if (existingByDate.has(row.date)) continue;
    plan.added.push(row);
    plan.inserts.push(row);
  }

  return plan;
}
