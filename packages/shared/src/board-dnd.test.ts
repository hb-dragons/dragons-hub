import { describe, expect, it } from "vitest";
import { computeDropTarget, buildColumnReorder } from "./board-dnd";
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
