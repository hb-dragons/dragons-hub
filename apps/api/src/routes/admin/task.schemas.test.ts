import { describe, expect, it } from "vitest";
import {
  taskBoardIdParamSchema,
  taskIdParamSchema,
  taskChecklistItemParamSchema,
  taskCommentParamSchema,
  taskListQuerySchema,
  taskCreateBodySchema,
  taskUpdateBodySchema,
  taskMoveBodySchema,
  checklistItemCreateBodySchema,
  checklistItemUpdateBodySchema,
  commentCreateBodySchema,
  commentUpdateBodySchema,
} from "./task.schemas";

describe("taskBoardIdParamSchema", () => {
  it("coerces string to positive integer", () => {
    expect(taskBoardIdParamSchema.parse({ boardId: "5" })).toEqual({ boardId: 5 });
  });

  it("rejects zero", () => {
    expect(() => taskBoardIdParamSchema.parse({ boardId: 0 })).toThrow();
  });

  it("rejects negative", () => {
    expect(() => taskBoardIdParamSchema.parse({ boardId: -1 })).toThrow();
  });

  it("rejects non-numeric", () => {
    expect(() => taskBoardIdParamSchema.parse({ boardId: "abc" })).toThrow();
  });
});

describe("taskIdParamSchema", () => {
  it("coerces string to positive integer", () => {
    expect(taskIdParamSchema.parse({ id: "3" })).toEqual({ id: 3 });
  });

  it("rejects zero", () => {
    expect(() => taskIdParamSchema.parse({ id: 0 })).toThrow();
  });

  it("rejects non-numeric", () => {
    expect(() => taskIdParamSchema.parse({ id: "abc" })).toThrow();
  });
});

describe("taskChecklistItemParamSchema", () => {
  it("coerces both ids", () => {
    expect(taskChecklistItemParamSchema.parse({ id: "1", itemId: "2" })).toEqual({
      id: 1,
      itemId: 2,
    });
  });

  it("rejects zero id", () => {
    expect(() =>
      taskChecklistItemParamSchema.parse({ id: 0, itemId: 1 }),
    ).toThrow();
  });

  it("rejects zero itemId", () => {
    expect(() =>
      taskChecklistItemParamSchema.parse({ id: 1, itemId: 0 }),
    ).toThrow();
  });
});

describe("taskCommentParamSchema", () => {
  it("coerces both ids", () => {
    expect(taskCommentParamSchema.parse({ id: "1", commentId: "2" })).toEqual({
      id: 1,
      commentId: 2,
    });
  });

  it("rejects zero id", () => {
    expect(() =>
      taskCommentParamSchema.parse({ id: 0, commentId: 1 }),
    ).toThrow();
  });

  it("rejects zero commentId", () => {
    expect(() =>
      taskCommentParamSchema.parse({ id: 1, commentId: 0 }),
    ).toThrow();
  });
});

describe("taskListQuerySchema", () => {
  it("accepts empty query", () => {
    expect(taskListQuerySchema.parse({})).toEqual({});
  });

  it("accepts all filters", () => {
    expect(
      taskListQuerySchema.parse({
        columnId: "3",
        assigneeId: "user-1",
        priority: "high",
      }),
    ).toEqual({ columnId: 3, assigneeId: "user-1", priority: "high" });
  });

  it("rejects invalid priority", () => {
    expect(() =>
      taskListQuerySchema.parse({ priority: "invalid" }),
    ).toThrow();
  });

  it("rejects non-positive columnId", () => {
    expect(() =>
      taskListQuerySchema.parse({ columnId: "0" }),
    ).toThrow();
  });

  it("rejects empty assigneeId", () => {
    expect(() =>
      taskListQuerySchema.parse({ assigneeId: "" }),
    ).toThrow();
  });

  it("accepts all valid priority values", () => {
    for (const priority of ["low", "normal", "high", "urgent"]) {
      expect(taskListQuerySchema.parse({ priority })).toEqual({ priority });
    }
  });
});

describe("taskCreateBodySchema", () => {
  it("accepts minimal valid body", () => {
    const result = taskCreateBodySchema.parse({
      title: "Buy jerseys",
      columnId: 1,
    });
    expect(result.title).toBe("Buy jerseys");
    expect(result.columnId).toBe(1);
  });

  it("accepts all optional fields", () => {
    const body = {
      title: "Task",
      columnId: 1,
      description: "Details",
      assigneeId: "user-1",
      priority: "high" as const,
      dueDate: "2025-06-01",
      matchId: 10,
      venueBookingId: 5,
    };
    expect(taskCreateBodySchema.parse(body)).toEqual(body);
  });

  it("accepts null optional fields", () => {
    const body = {
      title: "Task",
      columnId: 1,
      description: null,
      assigneeId: null,
      dueDate: null,
      matchId: null,
      venueBookingId: null,
    };
    expect(taskCreateBodySchema.parse(body)).toEqual(body);
  });

  it("rejects empty title", () => {
    expect(() =>
      taskCreateBodySchema.parse({ title: "", columnId: 1 }),
    ).toThrow();
  });

  it("rejects title exceeding 300 chars", () => {
    expect(() =>
      taskCreateBodySchema.parse({ title: "x".repeat(301), columnId: 1 }),
    ).toThrow();
  });

  it("rejects missing columnId", () => {
    expect(() =>
      taskCreateBodySchema.parse({ title: "Task" }),
    ).toThrow();
  });

  it("rejects invalid priority", () => {
    expect(() =>
      taskCreateBodySchema.parse({ title: "Task", columnId: 1, priority: "invalid" }),
    ).toThrow();
  });

  it("rejects invalid date format", () => {
    expect(() =>
      taskCreateBodySchema.parse({ title: "Task", columnId: 1, dueDate: "bad" }),
    ).toThrow();
  });

  it("rejects non-positive columnId", () => {
    expect(() =>
      taskCreateBodySchema.parse({ title: "Task", columnId: 0 }),
    ).toThrow();
  });

  it("rejects description exceeding 5000 chars", () => {
    expect(() =>
      taskCreateBodySchema.parse({ title: "Task", columnId: 1, description: "x".repeat(5001) }),
    ).toThrow();
  });
});

describe("taskUpdateBodySchema", () => {
  it("accepts empty object", () => {
    expect(taskUpdateBodySchema.parse({})).toEqual({});
  });

  it("accepts title update", () => {
    expect(taskUpdateBodySchema.parse({ title: "New" })).toEqual({ title: "New" });
  });

  it("accepts null description", () => {
    expect(taskUpdateBodySchema.parse({ description: null })).toEqual({
      description: null,
    });
  });

  it("accepts null assigneeId", () => {
    expect(taskUpdateBodySchema.parse({ assigneeId: null })).toEqual({
      assigneeId: null,
    });
  });

  it("accepts null dueDate", () => {
    expect(taskUpdateBodySchema.parse({ dueDate: null })).toEqual({
      dueDate: null,
    });
  });

  it("rejects empty title", () => {
    expect(() => taskUpdateBodySchema.parse({ title: "" })).toThrow();
  });

  it("rejects invalid priority", () => {
    expect(() =>
      taskUpdateBodySchema.parse({ priority: "invalid" }),
    ).toThrow();
  });

  it("rejects invalid dueDate format", () => {
    expect(() =>
      taskUpdateBodySchema.parse({ dueDate: "bad-date" }),
    ).toThrow();
  });
});

describe("taskMoveBodySchema", () => {
  it("accepts valid move", () => {
    expect(taskMoveBodySchema.parse({ columnId: 2, position: 0 })).toEqual({
      columnId: 2,
      position: 0,
    });
  });

  it("rejects non-positive columnId", () => {
    expect(() =>
      taskMoveBodySchema.parse({ columnId: 0, position: 0 }),
    ).toThrow();
  });

  it("rejects negative position", () => {
    expect(() =>
      taskMoveBodySchema.parse({ columnId: 1, position: -1 }),
    ).toThrow();
  });

  it("rejects missing columnId", () => {
    expect(() => taskMoveBodySchema.parse({ position: 0 })).toThrow();
  });

  it("rejects missing position", () => {
    expect(() => taskMoveBodySchema.parse({ columnId: 1 })).toThrow();
  });
});

describe("checklistItemCreateBodySchema", () => {
  it("accepts label only", () => {
    expect(checklistItemCreateBodySchema.parse({ label: "Step 1" })).toEqual({
      label: "Step 1",
    });
  });

  it("accepts label with position", () => {
    expect(
      checklistItemCreateBodySchema.parse({ label: "Step 1", position: 0 }),
    ).toEqual({ label: "Step 1", position: 0 });
  });

  it("rejects empty label", () => {
    expect(() =>
      checklistItemCreateBodySchema.parse({ label: "" }),
    ).toThrow();
  });

  it("rejects label exceeding 200 chars", () => {
    expect(() =>
      checklistItemCreateBodySchema.parse({ label: "x".repeat(201) }),
    ).toThrow();
  });

  it("rejects negative position", () => {
    expect(() =>
      checklistItemCreateBodySchema.parse({ label: "Step", position: -1 }),
    ).toThrow();
  });
});

describe("checklistItemUpdateBodySchema", () => {
  it("accepts label update", () => {
    expect(checklistItemUpdateBodySchema.parse({ label: "Updated" })).toEqual({
      label: "Updated",
    });
  });

  it("accepts isChecked update", () => {
    expect(checklistItemUpdateBodySchema.parse({ isChecked: true })).toEqual({
      isChecked: true,
    });
  });

  it("accepts checkedBy update", () => {
    expect(
      checklistItemUpdateBodySchema.parse({ checkedBy: "admin" }),
    ).toEqual({ checkedBy: "admin" });
  });

  it("accepts null checkedBy", () => {
    expect(
      checklistItemUpdateBodySchema.parse({ checkedBy: null }),
    ).toEqual({ checkedBy: null });
  });

  it("accepts empty object", () => {
    expect(checklistItemUpdateBodySchema.parse({})).toEqual({});
  });

  it("rejects empty label", () => {
    expect(() =>
      checklistItemUpdateBodySchema.parse({ label: "" }),
    ).toThrow();
  });

  it("rejects label exceeding 200 chars", () => {
    expect(() =>
      checklistItemUpdateBodySchema.parse({ label: "x".repeat(201) }),
    ).toThrow();
  });
});

describe("commentCreateBodySchema", () => {
  it("accepts valid body and authorId", () => {
    expect(
      commentCreateBodySchema.parse({ body: "Nice work!", authorId: "user-1" }),
    ).toEqual({ body: "Nice work!", authorId: "user-1" });
  });

  it("rejects empty body", () => {
    expect(() =>
      commentCreateBodySchema.parse({ body: "", authorId: "user-1" }),
    ).toThrow();
  });

  it("rejects body exceeding 5000 chars", () => {
    expect(() =>
      commentCreateBodySchema.parse({ body: "x".repeat(5001), authorId: "user-1" }),
    ).toThrow();
  });

  it("rejects empty authorId", () => {
    expect(() =>
      commentCreateBodySchema.parse({ body: "Text", authorId: "" }),
    ).toThrow();
  });

  it("rejects missing authorId", () => {
    expect(() => commentCreateBodySchema.parse({ body: "Text" })).toThrow();
  });

  it("rejects missing body", () => {
    expect(() =>
      commentCreateBodySchema.parse({ authorId: "user-1" }),
    ).toThrow();
  });
});

describe("commentUpdateBodySchema", () => {
  it("accepts valid body", () => {
    expect(commentUpdateBodySchema.parse({ body: "Updated" })).toEqual({
      body: "Updated",
    });
  });

  it("rejects empty body", () => {
    expect(() => commentUpdateBodySchema.parse({ body: "" })).toThrow();
  });

  it("rejects body exceeding 5000 chars", () => {
    expect(() =>
      commentUpdateBodySchema.parse({ body: "x".repeat(5001) }),
    ).toThrow();
  });

  it("rejects missing body", () => {
    expect(() => commentUpdateBodySchema.parse({})).toThrow();
  });
});
