import { describe, expect, it } from "vitest";
import {
  computeDropTarget,
  buildColumnReorder,
  applyTaskMove,
  applyColumnReorder,
} from "./board-dnd";
import type { TaskCardData } from "./tasks";
import type { BoardColumnData } from "./boards";

function col(id: number, position: number, name = "Col"): BoardColumnData {
  return { id, name, position, color: null, isDoneColumn: false };
}

function task(
  id: number,
  columnId: number,
  position: number,
  title = "T",
): TaskCardData {
  return {
    id,
    boardId: 1,
    title,
    description: null,
    priority: "normal",
    dueDate: null,
    position,
    columnId,
    checklistTotal: 0,
    checklistChecked: 0,
    assignees: [],
  };
}

describe("computeDropTarget", () => {
  const tasks = [
    task(10, 1, 0, "A"),
    task(11, 1, 1, "B"),
    task(12, 2, 0, "C"),
    task(13, 2, 1, "D"),
  ];

  it("drops at end of empty column when over is a column id", () => {
    const result = computeDropTarget(
      { type: "task", id: 10, columnId: 1 },
      { type: "column", id: 3, columnId: 3 },
      tasks,
    );
    expect(result).toEqual({ columnId: 3, position: 0 });
  });

  it("drops at end of populated column when over is that column id", () => {
    const result = computeDropTarget(
      { type: "task", id: 10, columnId: 1 },
      { type: "column", id: 2, columnId: 2 },
      tasks,
    );
    expect(result).toEqual({ columnId: 2, position: 2 });
  });

  it("same-column move up: over task above", () => {
    const result = computeDropTarget(
      { type: "task", id: 11, columnId: 1 },
      { type: "task", id: 10, columnId: 1 },
      tasks,
    );
    expect(result).toEqual({ columnId: 1, position: 0 });
  });

  it("same-column move down: over task below", () => {
    const result = computeDropTarget(
      { type: "task", id: 10, columnId: 1 },
      { type: "task", id: 11, columnId: 1 },
      tasks,
    );
    expect(result).toEqual({ columnId: 1, position: 1 });
  });

  it("cross-column: over a task inserts at that task's position", () => {
    const result = computeDropTarget(
      { type: "task", id: 10, columnId: 1 },
      { type: "task", id: 13, columnId: 2 },
      tasks,
    );
    expect(result).toEqual({ columnId: 2, position: 1 });
  });

  it("returns null when active and over are the same task", () => {
    const result = computeDropTarget(
      { type: "task", id: 10, columnId: 1 },
      { type: "task", id: 10, columnId: 1 },
      tasks,
    );
    expect(result).toBeNull();
  });
});

describe("buildColumnReorder", () => {
  const columns = [col(1, 0), col(2, 1), col(3, 2)];

  it("moves column from index 2 to index 0", () => {
    const result = buildColumnReorder(columns, "col-3", "col-1");
    expect(result).toEqual([
      { id: 3, position: 0 },
      { id: 1, position: 1 },
      { id: 2, position: 2 },
    ]);
  });

  it("no-op when over equals active", () => {
    const result = buildColumnReorder(columns, "col-2", "col-2");
    expect(result).toBeNull();
  });

  it("returns null when ids are not column-prefixed", () => {
    const result = buildColumnReorder(columns, "task-1", "col-2");
    expect(result).toBeNull();
  });
});

describe("applyTaskMove", () => {
  const tasks = [
    task(10, 1, 0, "A"),
    task(11, 1, 1, "B"),
    task(12, 1, 2, "C"),
    task(13, 2, 0, "D"),
    task(14, 2, 1, "E"),
  ];

  function byId(list: TaskCardData[]) {
    return new Map(list.map((t) => [t.id, t]));
  }

  it("same-column move up shifts rows down in [target, from)", () => {
    const out = byId(applyTaskMove(tasks, 12, 1, 0));
    expect(out.get(12)).toMatchObject({ columnId: 1, position: 0 });
    expect(out.get(10)).toMatchObject({ columnId: 1, position: 1 });
    expect(out.get(11)).toMatchObject({ columnId: 1, position: 2 });
    expect(out.get(13)).toMatchObject({ columnId: 2, position: 0 });
    expect(out.get(14)).toMatchObject({ columnId: 2, position: 1 });
  });

  it("same-column move down shifts rows up in (from, target]", () => {
    const out = byId(applyTaskMove(tasks, 10, 1, 2));
    expect(out.get(10)).toMatchObject({ columnId: 1, position: 2 });
    expect(out.get(11)).toMatchObject({ columnId: 1, position: 0 });
    expect(out.get(12)).toMatchObject({ columnId: 1, position: 1 });
    expect(out.get(13)).toMatchObject({ columnId: 2, position: 0 });
    expect(out.get(14)).toMatchObject({ columnId: 2, position: 1 });
  });

  it("cross-column move closes gap in source and opens slot in target", () => {
    const out = byId(applyTaskMove(tasks, 11, 2, 1));
    expect(out.get(11)).toMatchObject({ columnId: 2, position: 1 });
    expect(out.get(10)).toMatchObject({ columnId: 1, position: 0 });
    expect(out.get(12)).toMatchObject({ columnId: 1, position: 1 });
    expect(out.get(13)).toMatchObject({ columnId: 2, position: 0 });
    expect(out.get(14)).toMatchObject({ columnId: 2, position: 2 });
  });

  it("clamps target position to target-column size", () => {
    const out = byId(applyTaskMove(tasks, 10, 2, 99));
    expect(out.get(10)).toMatchObject({ columnId: 2, position: 2 });
    expect(out.get(13)).toMatchObject({ columnId: 2, position: 0 });
    expect(out.get(14)).toMatchObject({ columnId: 2, position: 1 });
  });

  it("no-op same-column same-position returns input unchanged", () => {
    const out = applyTaskMove(tasks, 11, 1, 1);
    expect(out).toBe(tasks);
  });

  it("unknown task id returns input unchanged", () => {
    const out = applyTaskMove(tasks, 999, 1, 0);
    expect(out).toBe(tasks);
  });
});

describe("applyColumnReorder", () => {
  const columns = [col(1, 0), col(2, 1), col(3, 2)];

  it("rewrites position by id and returns array sorted by new position", () => {
    const out = applyColumnReorder(columns, [
      { id: 3, position: 0 },
      { id: 1, position: 1 },
      { id: 2, position: 2 },
    ]);
    expect(out.find((c) => c.id === 1)?.position).toBe(1);
    expect(out.find((c) => c.id === 2)?.position).toBe(2);
    expect(out.find((c) => c.id === 3)?.position).toBe(0);
    expect(out.map((c) => c.id)).toEqual([3, 1, 2]);
  });

  it("returns original columns when reorder list is empty", () => {
    const out = applyColumnReorder(columns, []);
    expect(out.map((c) => ({ id: c.id, position: c.position }))).toEqual(
      columns.map((c) => ({ id: c.id, position: c.position })),
    );
  });
});
