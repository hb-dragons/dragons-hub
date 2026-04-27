import { describe, it, expect } from "vitest";
import { boardTaskComparator } from "./board-task-sort";
import type { TaskCardData } from "./tasks";

const make = (overrides: Partial<TaskCardData>): TaskCardData => ({
  id: 1,
  boardId: 1,
  columnId: 1,
  position: 0,
  title: "t",
  description: null,
  priority: "normal",
  dueDate: null,
  checklistChecked: 0,
  checklistTotal: 0,
  assignees: [],
  // updatedAt is optional on the wire — comparator tolerates missing values.
  ...overrides,
});

describe("boardTaskComparator", () => {
  it("position mode preserves position then id", () => {
    const cmp = boardTaskComparator("position");
    const a = make({ id: 1, position: 2 });
    const b = make({ id: 2, position: 1 });
    expect([a, b].sort(cmp).map((t) => t.id)).toEqual([2, 1]);
  });

  it("position mode falls back to id when position equal", () => {
    const cmp = boardTaskComparator("position");
    const a = make({ id: 5, position: 0 });
    const b = make({ id: 3, position: 0 });
    expect([a, b].sort(cmp).map((t) => t.id)).toEqual([3, 5]);
  });

  it("due-asc puts earliest due first, nulls last", () => {
    const cmp = boardTaskComparator("due-asc");
    const a = make({ id: 1, dueDate: "2026-05-10T00:00:00Z" });
    const b = make({ id: 2, dueDate: "2026-04-10T00:00:00Z" });
    const c = make({ id: 3, dueDate: null });
    expect([a, b, c].sort(cmp).map((t) => t.id)).toEqual([2, 1, 3]);
  });

  it("due-desc puts latest due first, nulls last", () => {
    const cmp = boardTaskComparator("due-desc");
    const a = make({ id: 1, dueDate: "2026-05-10T00:00:00Z" });
    const b = make({ id: 2, dueDate: "2026-04-10T00:00:00Z" });
    const c = make({ id: 3, dueDate: null });
    expect([a, b, c].sort(cmp).map((t) => t.id)).toEqual([1, 2, 3]);
  });

  it("priority-desc orders urgent > high > normal > low", () => {
    const cmp = boardTaskComparator("priority-desc");
    const items = [
      make({ id: 1, priority: "low" }),
      make({ id: 2, priority: "urgent" }),
      make({ id: 3, priority: "normal" }),
      make({ id: 4, priority: "high" }),
    ];
    expect(items.sort(cmp).map((t) => t.id)).toEqual([2, 4, 3, 1]);
  });

  it("updated-desc puts latest updatedAt first, missing last", () => {
    const cmp = boardTaskComparator("updated-desc");
    const items = [
      make({ id: 1, updatedAt: "2026-04-26T00:00:00Z" } as Partial<TaskCardData>),
      make({ id: 2, updatedAt: "2026-04-27T00:00:00Z" } as Partial<TaskCardData>),
      make({ id: 3 }),
    ];
    expect(items.sort(cmp).map((t) => t.id)).toEqual([2, 1, 3]);
  });

  it("comparator is stable on equal keys", () => {
    const cmp = boardTaskComparator("priority-desc");
    const a = make({ id: 1, priority: "high" });
    const b = make({ id: 2, priority: "high" });
    expect([a, b].sort(cmp).map((t) => t.id)).toEqual([1, 2]);
  });
});
