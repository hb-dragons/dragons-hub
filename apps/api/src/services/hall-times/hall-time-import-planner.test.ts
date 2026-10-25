import { describe, expect, it } from "vitest";
import type { HallTimeRow } from "@dragons/shared";
import { planHallTimeImport } from "./hall-time-import-planner";

function stored(over: Partial<HallTimeRow> & Pick<HallTimeRow, "id" | "date">): HallTimeRow {
  return {
    venueId: 1,
    kind: "open",
    startTime: "10:00",
    endTime: "14:00",
    note: null,
    source: "anlage_t",
    createdAt: "",
    updatedAt: "",
    ...over,
  };
}

const open = (date: string, startTime = "10:00", endTime = "14:00") =>
  ({ date, kind: "open", startTime, endTime, note: null }) as const;

describe("planHallTimeImport", () => {
  it("spans the sheet's dates and classifies every stored row inside it", () => {
    const plan = planHallTimeImport({
      existing: [
        stored({ id: 1, date: "2026-09-12" }), // changed
        stored({ id: 2, date: "2026-09-13" }), // removed (sheet says nothing)
        stored({ id: 3, date: "2026-09-19" }), // unchanged
        stored({ id: 4, date: "2026-09-05", source: "manual" }), // manual, kept
        stored({ id: 5, date: "2026-09-26", source: "manual" }), // manual, sheet wins
      ],
      rows: [open("2026-09-12", "12:00", "16:00"), open("2026-09-19"), open("2026-09-26", "09:00", "11:00"), open("2026-10-03")],
    });

    expect(plan.span).toEqual({ from: "2026-09-12", to: "2026-10-03" });
    expect(plan.added.map((r) => r.date)).toEqual(["2026-10-03"]);
    expect(plan.changed.map((c) => [c.before.id, c.after.startTime])).toEqual([
      [1, "12:00"],
      [5, "09:00"],
    ]);
    expect(plan.removed.map((r) => r.id)).toEqual([2]);
    expect(plan.unchanged).toBe(2);
    expect(plan.deleteIds).toEqual([1, 2, 5]);
    expect(plan.inserts.map((r) => r.date)).toEqual(["2026-09-12", "2026-09-26", "2026-10-03"]);
    expect(Object.keys(plan).sort()).toEqual(["added", "changed", "deleteIds", "inserts", "removed", "span", "unchanged"]);
  });

  it("counts a surviving manual row as unchanged and keeps it in the after-picture", () => {
    const plan = planHallTimeImport({
      existing: [stored({ id: 4, date: "2026-09-05", source: "manual", startTime: "09:00", endTime: "12:00" })],
      rows: [open("2026-09-01"), open("2026-09-30")],
    });

    expect(plan.unchanged).toBe(1);
    expect(plan.deleteIds).toEqual([]);
  });
});
