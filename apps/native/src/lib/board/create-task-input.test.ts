import { describe, expect, it } from "vitest";
import type { TaskCardData } from "@dragons/shared";

import { buildCreateTaskInput, restoreTaskInput } from "@/lib/board/create-task-input";

/**
 * The quick-create sheet's submit gate and payload, as one function (#222).
 * The sheet is a route now, so what it sends has to be checkable without
 * mounting it.
 */

const draft = {
  columnId: 3,
  title: "Book the hall",
  description: "",
  priority: "normal" as const,
  dueDate: null,
};

describe("buildCreateTaskInput", () => {
  it("sends the trimmed title and the chosen column", () => {
    expect(buildCreateTaskInput({ ...draft, title: "  Book the hall  " })).toEqual({
      columnId: 3,
      title: "Book the hall",
    });
  });

  // Every optional field the server would default anyway is left out, so a
  // task created with nothing but a title posts nothing but a title.
  it("omits an empty description, a normal priority and an unset due date", () => {
    const body = buildCreateTaskInput(draft);

    expect(body).not.toHaveProperty("description");
    expect(body).not.toHaveProperty("priority");
    expect(body).not.toHaveProperty("dueDate");
  });

  it("sends the description, priority and due date once they are set", () => {
    expect(
      buildCreateTaskInput({
        ...draft,
        description: "Ask the caretaker",
        priority: "urgent",
        dueDate: "2026-08-20",
      }),
    ).toEqual({
      columnId: 3,
      title: "Book the hall",
      description: "Ask the caretaker",
      priority: "urgent",
      dueDate: "2026-08-20",
    });
  });

  // Whitespace is not a description.
  it("omits a description that is only whitespace", () => {
    expect(buildCreateTaskInput({ ...draft, description: "   " })).not.toHaveProperty(
      "description",
    );
  });

  it("refuses a draft with no title", () => {
    expect(buildCreateTaskInput({ ...draft, title: "   " })).toBeNull();
  });

  // The column comes from a route param, so "no column" is reachable: a stale
  // deep link, or a board whose columns have not loaded yet.
  it("refuses a draft with no column", () => {
    expect(buildCreateTaskInput({ ...draft, columnId: null })).toBeNull();
  });
});

/**
 * Undo after a delete, which the board offers from the swipe action, the
 * context menu and the task sheet (#220). The deleted row is gone, so undo
 * creates a task again — and what it sends decides how much of the old one
 * comes back.
 */

const deleted: TaskCardData = {
  id: 42,
  boardId: 7,
  title: "Book the hall",
  description: "Ask the caretaker",
  assignees: [
    { userId: "u1", name: "Ada", assignedAt: "2026-08-01T00:00:00.000Z" },
    { userId: "u2", name: null, assignedAt: "2026-08-01T00:00:00.000Z" },
  ],
  priority: "urgent",
  dueDate: "2026-08-20",
  position: 3,
  columnId: 5,
  checklistTotal: 2,
  checklistChecked: 1,
};

describe("restoreTaskInput", () => {
  it("puts the task back in its column with everything it was carrying", () => {
    expect(restoreTaskInput(deleted)).toEqual({
      columnId: 5,
      title: "Book the hall",
      description: "Ask the caretaker",
      priority: "urgent",
      dueDate: "2026-08-20",
      assigneeIds: ["u1", "u2"],
    });
  });

  // Unlike a draft, a restore states every field: leaving one out would let
  // the server default it, and undo would hand back a *different* task —
  // silently dropping the description or resetting an urgent task to normal.
  it("states the fields a draft would have left to the server's defaults", () => {
    const body = restoreTaskInput({
      ...deleted,
      description: null,
      priority: "normal",
      dueDate: null,
      assignees: [],
    });

    expect(body).toEqual({
      columnId: 5,
      title: "Book the hall",
      description: null,
      priority: "normal",
      dueDate: null,
      assigneeIds: [],
    });
  });
});
