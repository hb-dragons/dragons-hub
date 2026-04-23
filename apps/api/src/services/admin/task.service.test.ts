import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

// --- Mock setup ---

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  db: new Proxy(
    {},
    {
      get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
    },
  ),
}));

// --- Imports (after mocks) ---

import {
  listTasks,
  createTask,
  getTaskDetail,
  updateTask,
  moveTask,
  deleteTask,
  addChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  addComment,
  updateComment,
  deleteComment,
  addAssignee,
  removeAssignee,
} from "./task.service";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

// --- Helpers ---

async function createBoardWithColumns() {
  await ctx.client.exec(
    `INSERT INTO "user" (id, name, email) VALUES ('test-user', 'Test', 'test@x.io')
     ON CONFLICT (id) DO NOTHING`,
  );
  await ctx.client.exec("INSERT INTO boards (name) VALUES ('Test Board')");
  await ctx.client.exec(`
    INSERT INTO board_columns (board_id, name, position, is_done_column)
    VALUES (1, 'To Do', 0, false), (1, 'In Progress', 1, false), (1, 'Done', 2, true)
  `);
  return { boardId: 1, todoColId: 1, inProgressColId: 2, doneColId: 3 };
}

// --- Tests ---

describe("listTasks", () => {
  it("returns empty array when no tasks", async () => {
    await createBoardWithColumns();
    const result = await listTasks(1);
    expect(result).toEqual([]);
  });

  it("returns tasks with checklist counts", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await ctx.client.exec(
      `INSERT INTO tasks (board_id, column_id, title) VALUES (${boardId}, ${todoColId}, 'Task 1')`,
    );
    await ctx.client.exec(
      "INSERT INTO task_checklist_items (task_id, label, is_checked, position) VALUES (1, 'Item A', true, 0), (1, 'Item B', false, 1)",
    );

    const result = await listTasks(boardId);

    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe("Task 1");
    expect(result[0]!.checklistTotal).toBe(2);
    expect(result[0]!.checklistChecked).toBe(1);
  });

  it("returns zero counts when no checklist items", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await ctx.client.exec(
      `INSERT INTO tasks (board_id, column_id, title) VALUES (${boardId}, ${todoColId}, 'Task')`,
    );

    const result = await listTasks(boardId);

    expect(result[0]!.checklistTotal).toBe(0);
    expect(result[0]!.checklistChecked).toBe(0);
  });

  it("filters by columnId", async () => {
    const { boardId, todoColId, inProgressColId } = await createBoardWithColumns();
    await ctx.client.exec(
      `INSERT INTO tasks (board_id, column_id, title) VALUES (${boardId}, ${todoColId}, 'Todo'), (${boardId}, ${inProgressColId}, 'InProg')`,
    );

    const result = await listTasks(boardId, { columnId: todoColId });

    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe("Todo");
  });

  it("filters by assigneeId", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await ctx.client.exec(
      `INSERT INTO "user" (id, name, email) VALUES ('user-1', 'User One', 'u1@x.io'), ('user-2', 'User Two', 'u2@x.io')
       ON CONFLICT (id) DO NOTHING`,
    );
    await ctx.client.exec(
      `INSERT INTO tasks (board_id, column_id, title) VALUES (${boardId}, ${todoColId}, 'Mine'), (${boardId}, ${todoColId}, 'Theirs')`,
    );
    // task id 1 assigned to user-1, task id 2 assigned to user-2
    await ctx.client.exec(
      `INSERT INTO task_assignees (task_id, user_id) VALUES (1, 'user-1'), (2, 'user-2')`,
    );

    const result = await listTasks(boardId, { assigneeId: "user-1" });

    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe("Mine");
  });

  it("filters by priority", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await ctx.client.exec(
      `INSERT INTO tasks (board_id, column_id, title, priority) VALUES (${boardId}, ${todoColId}, 'Normal', 'normal'), (${boardId}, ${todoColId}, 'Urgent', 'urgent')`,
    );

    const result = await listTasks(boardId, { priority: "urgent" });

    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe("Urgent");
  });

  it("orders by position then id", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await ctx.client.exec(
      `INSERT INTO tasks (board_id, column_id, title, position) VALUES (${boardId}, ${todoColId}, 'Second', 1), (${boardId}, ${todoColId}, 'First', 0)`,
    );

    const result = await listTasks(boardId);

    expect(result[0]!.title).toBe("First");
    expect(result[1]!.title).toBe("Second");
  });
});

describe("createTask", () => {
  it("creates task with required fields", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();

    const result = await createTask(boardId, {
      title: "New Task",
      columnId: todoColId,
    }, "test-user");

    expect(result).not.toBeNull();
    expect(result!.title).toBe("New Task");
    expect(result!.columnId).toBe(todoColId);
    expect(result!.priority).toBe("normal");
    expect(result!.position).toBe(0);
    expect(result!.checklist).toEqual([]);
    expect(result!.comments).toEqual([]);
  });

  it("creates task with all optional fields", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await ctx.client.exec(
      `INSERT INTO "user" (id, name, email) VALUES ('user-1', 'User One', 'u1@x.io')
       ON CONFLICT (id) DO NOTHING`,
    );

    const result = await createTask(boardId, {
      title: "Full Task",
      columnId: todoColId,
      description: "Details here",
      assigneeIds: ["user-1"],
      priority: "high",
      dueDate: "2025-06-01",
    }, "test-user");

    expect(result!.description).toBe("Details here");
    expect(result!.assignees.map((a) => a.userId)).toEqual(["user-1"]);
    expect(result!.priority).toBe("high");
    expect(result!.dueDate).toBe("2025-06-01");
  });

  it("auto-increments position within column", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();

    const task1 = await createTask(boardId, { title: "First", columnId: todoColId }, "test-user");
    const task2 = await createTask(boardId, { title: "Second", columnId: todoColId }, "test-user");

    expect(task1!.position).toBe(0);
    expect(task2!.position).toBe(1);
  });

  it("returns null for non-existent board", async () => {
    const result = await createTask(999, { title: "Task", columnId: 1 }, "test-user");
    expect(result).toBeNull();
  });

  it("returns null for non-existent column", async () => {
    const { boardId } = await createBoardWithColumns();
    const result = await createTask(boardId, { title: "Task", columnId: 999 }, "test-user");
    expect(result).toBeNull();
  });

  it("returns null for column belonging to different board", async () => {
    await createBoardWithColumns();
    await ctx.client.exec("INSERT INTO boards (name) VALUES ('Board 2')");
    await ctx.client.exec(
      "INSERT INTO board_columns (board_id, name, position) VALUES (2, 'Col', 0)",
    );

    // Column 4 belongs to board 2, try to use it with board 1
    const result = await createTask(1, { title: "Task", columnId: 4 }, "test-user");
    expect(result).toBeNull();
  });
});

describe("getTaskDetail", () => {
  it("returns task with checklist and comments", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task 1", columnId: todoColId }, "test-user");

    await ctx.client.exec(
      "INSERT INTO task_checklist_items (task_id, label, position) VALUES (1, 'Item 1', 0)",
    );
    await ctx.client.exec(
      "INSERT INTO task_comments (task_id, author_id, body) VALUES (1, 'user-1', 'Great!')",
    );

    const result = await getTaskDetail(1);

    expect(result).not.toBeNull();
    expect(result!.title).toBe("Task 1");
    expect(result!.checklist).toHaveLength(1);
    expect(result!.checklist[0]!.label).toBe("Item 1");
    expect(result!.comments).toHaveLength(1);
    expect(result!.comments[0]!.body).toBe("Great!");
  });

  it("returns null for non-existent task", async () => {
    const result = await getTaskDetail(999);
    expect(result).toBeNull();
  });

  it("returns empty checklist and comments for new task", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Bare Task", columnId: todoColId }, "test-user");

    const result = await getTaskDetail(1);

    expect(result!.checklist).toEqual([]);
    expect(result!.comments).toEqual([]);
  });
});

describe("updateTask", () => {
  it("updates task title", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Old", columnId: todoColId }, "test-user");

    const result = await updateTask(1, { title: "New" }, "test-user");

    expect(result).not.toBeNull();
    expect(result!.title).toBe("New");
  });

  it("updates task description", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId }, "test-user");

    const result = await updateTask(1, { description: "Updated desc" }, "test-user");

    expect(result!.description).toBe("Updated desc");
  });

  it("clears description with null", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, {
      title: "Task",
      columnId: todoColId,
      description: "Has desc",
    }, "test-user");

    const result = await updateTask(1, { description: null }, "test-user");

    expect(result!.description).toBeNull();
  });

  it("returns null for non-existent task", async () => {
    const result = await updateTask(999, { title: "Nothing" }, "test-user");
    expect(result).toBeNull();
  });
});

describe("moveTask", () => {
  it("moves task to new column and position", async () => {
    const { boardId, todoColId, inProgressColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId }, "test-user");

    const result = await moveTask(1, inProgressColId, 0);

    expect(result).not.toBeNull();
    expect(result!.columnId).toBe(inProgressColId);
    expect(result!.position).toBe(0);
  });

  it("returns null for non-existent task", async () => {
    await createBoardWithColumns();
    const result = await moveTask(999, 1, 0);
    expect(result).toBeNull();
  });

  it("returns null for non-existent column", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId }, "test-user");

    const result = await moveTask(1, 999, 0);
    expect(result).toBeNull();
  });
});

describe("deleteTask", () => {
  it("deletes existing task", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "To Delete", columnId: todoColId }, "test-user");

    const result = await deleteTask(1);

    expect(result).toBe(true);
    expect(await getTaskDetail(1)).toBeNull();
  });

  it("returns false for non-existent task", async () => {
    const result = await deleteTask(999);
    expect(result).toBe(false);
  });

  it("cascades delete to checklist items and comments", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId }, "test-user");
    await addChecklistItem(1, { label: "Item" });
    await addComment(1, { body: "Comment" }, "user-1");

    await deleteTask(1);

    const items = await ctx.client.query(
      "SELECT COUNT(*) as cnt FROM task_checklist_items WHERE task_id = 1",
    );
    expect((items.rows[0] as { cnt: number }).cnt).toBe(0);

    const comments = await ctx.client.query(
      "SELECT COUNT(*) as cnt FROM task_comments WHERE task_id = 1",
    );
    expect((comments.rows[0] as { cnt: number }).cnt).toBe(0);
  });
});

describe("addChecklistItem", () => {
  it("adds item with auto-incremented position", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId }, "test-user");

    const item1 = await addChecklistItem(1, { label: "Step 1" });
    const item2 = await addChecklistItem(1, { label: "Step 2" });

    expect(item1!.label).toBe("Step 1");
    expect(item1!.position).toBe(0);
    expect(item1!.isChecked).toBe(false);
    expect(item2!.position).toBe(1);
  });

  it("adds item with explicit position", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId }, "test-user");

    const item = await addChecklistItem(1, { label: "Step", position: 5 });

    expect(item!.position).toBe(5);
  });

  it("returns null for non-existent task", async () => {
    const result = await addChecklistItem(999, { label: "Item" });
    expect(result).toBeNull();
  });
});

describe("updateChecklistItem", () => {
  it("updates label", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId }, "test-user");
    await addChecklistItem(1, { label: "Old" });

    const result = await updateChecklistItem(1, 1, { label: "New" }, "test-user");

    expect(result!.label).toBe("New");
  });

  it("checks item and sets checkedAt", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId }, "test-user");
    await addChecklistItem(1, { label: "Item" });

    const result = await updateChecklistItem(1, 1, { isChecked: true }, "test-user");

    expect(result!.isChecked).toBe(true);
    expect(result!.checkedBy).toBe("test-user");
    expect(result!.checkedAt).not.toBeNull();
  });

  it("unchecks item and clears checkedAt and checkedBy", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId }, "test-user");
    await addChecklistItem(1, { label: "Item" });
    await updateChecklistItem(1, 1, { isChecked: true }, "test-user");

    const result = await updateChecklistItem(1, 1, { isChecked: false }, "test-user");

    expect(result!.isChecked).toBe(false);
    expect(result!.checkedBy).toBeNull();
    expect(result!.checkedAt).toBeNull();
  });

  it("updates label without changing isChecked", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId }, "test-user");
    await addChecklistItem(1, { label: "Item" });

    const result = await updateChecklistItem(1, 1, { label: "Renamed" }, "test-user");

    expect(result!.label).toBe("Renamed");
    expect(result!.isChecked).toBe(false);
    expect(result!.checkedBy).toBeNull();
  });

  it("returns null for non-existent item", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId }, "test-user");

    const result = await updateChecklistItem(1, 999, { label: "X" }, "test-user");

    expect(result).toBeNull();
  });

  it("returns null when item belongs to different task", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task 1", columnId: todoColId }, "test-user");
    await createTask(boardId, { title: "Task 2", columnId: todoColId }, "test-user");
    await addChecklistItem(2, { label: "Item" });

    // Item 1 belongs to task 2, try to update via task 1
    const result = await updateChecklistItem(1, 1, { label: "Hack" }, "test-user");

    expect(result).toBeNull();
  });

  it("sets checkedBy from callerId when checking item", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId }, "test-user");
    await addChecklistItem(1, { label: "Item" });

    const result = await updateChecklistItem(1, 1, { isChecked: true }, "test-user");

    expect(result!.isChecked).toBe(true);
    expect(result!.checkedAt).not.toBeNull();
    expect(result!.checkedBy).toBe("test-user");
  });
});

describe("deleteChecklistItem", () => {
  it("deletes existing item", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId }, "test-user");
    await addChecklistItem(1, { label: "Item" });

    const result = await deleteChecklistItem(1, 1);

    expect(result).toBe(true);
  });

  it("returns false for non-existent item", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId }, "test-user");

    const result = await deleteChecklistItem(1, 999);

    expect(result).toBe(false);
  });

  it("returns false when item belongs to different task", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task 1", columnId: todoColId }, "test-user");
    await createTask(boardId, { title: "Task 2", columnId: todoColId }, "test-user");
    await addChecklistItem(2, { label: "Item" });

    const result = await deleteChecklistItem(1, 1);

    expect(result).toBe(false);
  });
});

describe("addComment", () => {
  it("adds comment to task", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId }, "test-user");

    const result = await addComment(1, { body: "Nice!" }, "user-1");

    expect(result).not.toBeNull();
    expect(result!.body).toBe("Nice!");
    expect(result!.authorId).toBe("user-1");
    expect(typeof result!.createdAt).toBe("string");
  });

  it("returns null for non-existent task", async () => {
    const result = await addComment(999, { body: "Text" }, "user-1");
    expect(result).toBeNull();
  });
});

describe("createTask with caller", () => {
  it("sets createdBy to callerId", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await ctx.client.exec(
      `INSERT INTO "user" (id, name, email) VALUES ('u_bob', 'Bob', 'b@x.io')
       ON CONFLICT (id) DO NOTHING`,
    );
    const task = await createTask(
      boardId,
      { title: "T", columnId: todoColId },
      "u_bob",
    );
    expect(task).not.toBeNull();
    expect(task!.createdBy).toBe("u_bob");
  });
});

describe("updateTask with caller", () => {
  it("does not change createdBy on update", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await ctx.client.exec(
      `INSERT INTO "user" (id, name, email) VALUES ('u_bob', 'Bob', 'b@x.io'), ('u_eve', 'Eve', 'e@x.io')
       ON CONFLICT (id) DO NOTHING`,
    );
    const created = await createTask(
      boardId,
      { title: "T", columnId: todoColId },
      "u_bob",
    );
    const updated = await updateTask(created!.id, { title: "T2" }, "u_eve");
    expect(updated!.createdBy).toBe("u_bob");
  });
});

describe("addComment with caller", () => {
  it("uses callerId as authorId", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await ctx.client.exec(
      `INSERT INTO "user" (id, name, email) VALUES ('u_alice', 'Alice', 'a@x.io')
       ON CONFLICT (id) DO NOTHING`,
    );
    await ctx.client.exec(
      `INSERT INTO tasks (board_id, column_id, title) VALUES (${boardId}, ${todoColId}, 'T')`,
    );
    const comment = await addComment(1, { body: "hello" }, "u_alice");
    expect(comment).not.toBeNull();
    expect(comment!.authorId).toBe("u_alice");
  });
});

describe("updateComment", () => {
  it("updates comment body", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId }, "test-user");
    await addComment(1, { body: "Old" }, "user-1");

    const result = await updateComment(1, 1, { body: "New" });

    expect(result!.body).toBe("New");
    expect(result!.authorId).toBe("user-1");
  });

  it("returns null for non-existent comment", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId }, "test-user");

    const result = await updateComment(1, 999, { body: "X" });

    expect(result).toBeNull();
  });

  it("returns null when comment belongs to different task", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task 1", columnId: todoColId }, "test-user");
    await createTask(boardId, { title: "Task 2", columnId: todoColId }, "test-user");
    await addComment(2, { body: "Text" }, "user-1");

    const result = await updateComment(1, 1, { body: "Hack" });

    expect(result).toBeNull();
  });
});

describe("updateChecklistItem checkedBy", () => {
  it("sets checkedBy to callerId when item becomes checked", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await ctx.client.exec(
      `INSERT INTO "user" (id, name, email) VALUES ('u_carol', 'Carol', 'c@x.io')
       ON CONFLICT (id) DO NOTHING`,
    );
    const task = await createTask(
      boardId,
      { title: "T", columnId: todoColId },
      "test-user",
    );
    const item = await addChecklistItem(task!.id, { label: "step" });
    const updated = await updateChecklistItem(
      task!.id,
      item!.id,
      { isChecked: true },
      "u_carol",
    );
    expect(updated!.isChecked).toBe(true);
    expect(updated!.checkedBy).toBe("u_carol");
  });

  it("clears checkedBy when item becomes unchecked", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await ctx.client.exec(
      `INSERT INTO "user" (id, name, email) VALUES ('u_carol', 'Carol', 'c@x.io')
       ON CONFLICT (id) DO NOTHING`,
    );
    const task = await createTask(
      boardId,
      { title: "T", columnId: todoColId },
      "test-user",
    );
    const item = await addChecklistItem(task!.id, { label: "step" });
    await updateChecklistItem(task!.id, item!.id, { isChecked: true }, "u_carol");
    const cleared = await updateChecklistItem(
      task!.id,
      item!.id,
      { isChecked: false },
      "u_carol",
    );
    expect(cleared!.isChecked).toBe(false);
    expect(cleared!.checkedBy).toBeNull();
    expect(cleared!.checkedAt).toBeNull();
  });
});

describe("deleteComment", () => {
  it("deletes existing comment", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId }, "test-user");
    await addComment(1, { body: "To delete" }, "user-1");

    const result = await deleteComment(1, 1);

    expect(result).toBe(true);
  });

  it("returns false for non-existent comment", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId }, "test-user");

    const result = await deleteComment(1, 999);

    expect(result).toBe(false);
  });

  it("returns false when comment belongs to different task", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task 1", columnId: todoColId }, "test-user");
    await createTask(boardId, { title: "Task 2", columnId: todoColId }, "test-user");
    await addComment(2, { body: "Text" }, "user-1");

    const result = await deleteComment(1, 1);

    expect(result).toBe(false);
  });
});

describe("moveTask position integrity", () => {
  it("appends to end when target position equals current sibling count", async () => {
    const { boardId, todoColId, inProgressColId } = await createBoardWithColumns();
    await ctx.client.exec(
      `INSERT INTO tasks (board_id, column_id, title, position) VALUES
        (${boardId}, ${inProgressColId}, 'A', 0),
        (${boardId}, ${inProgressColId}, 'B', 1),
        (${boardId}, ${todoColId}, 'C', 0)`,
    );
    // Move C to position 2 in inProgress (end)
    const moved = await moveTask(3, inProgressColId, 2);
    expect(moved!.position).toBe(2);

    const inProgress = await listTasks(boardId, { columnId: inProgressColId });
    expect(inProgress.map((t) => t.title)).toEqual(["A", "B", "C"]);
  });

  it("inserts at position 0 and shifts siblings", async () => {
    const { boardId, todoColId, inProgressColId } = await createBoardWithColumns();
    await ctx.client.exec(
      `INSERT INTO tasks (board_id, column_id, title, position) VALUES
        (${boardId}, ${inProgressColId}, 'A', 0),
        (${boardId}, ${inProgressColId}, 'B', 1),
        (${boardId}, ${todoColId}, 'C', 0)`,
    );
    await moveTask(3, inProgressColId, 0);

    const inProgress = await listTasks(boardId, { columnId: inProgressColId });
    expect(inProgress.map((t) => t.title)).toEqual(["C", "A", "B"]);
    expect(inProgress.map((t) => t.position)).toEqual([0, 1, 2]);
  });

  it("reorders within the same column", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await ctx.client.exec(
      `INSERT INTO tasks (board_id, column_id, title, position) VALUES
        (${boardId}, ${todoColId}, 'A', 0),
        (${boardId}, ${todoColId}, 'B', 1),
        (${boardId}, ${todoColId}, 'C', 2)`,
    );
    // Move C from position 2 to position 0
    await moveTask(3, todoColId, 0);

    const todo = await listTasks(boardId, { columnId: todoColId });
    expect(todo.map((t) => t.title)).toEqual(["C", "A", "B"]);
  });

  it("is a no-op when clamped position equals current position", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await ctx.client.exec(
      `INSERT INTO tasks (board_id, column_id, title, position) VALUES
        (${boardId}, ${todoColId}, 'A', 0),
        (${boardId}, ${todoColId}, 'B', 1)`,
    );
    const moved = await moveTask(1, todoColId, 0);
    expect(moved).not.toBeNull();
    expect(moved!.id).toBe(1);
    expect(moved!.position).toBe(0);

    const rows = await listTasks(boardId, { columnId: todoColId });
    expect(rows.map((t) => t.title)).toEqual(["A", "B"]);
    expect(rows.map((t) => t.position)).toEqual([0, 1]);
  });

  it("reorders down within the same column", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await ctx.client.exec(
      `INSERT INTO tasks (board_id, column_id, title, position) VALUES
        (${boardId}, ${todoColId}, 'A', 0),
        (${boardId}, ${todoColId}, 'B', 1),
        (${boardId}, ${todoColId}, 'C', 2)`,
    );
    // Move A from position 0 to position 2
    const moved = await moveTask(1, todoColId, 2);
    expect(moved).not.toBeNull();
    expect(moved!.position).toBe(2);

    const rows = await listTasks(boardId, { columnId: todoColId });
    expect(rows.map((t) => t.title)).toEqual(["B", "C", "A"]);
    expect(rows.map((t) => t.position)).toEqual([0, 1, 2]);
  });
});

describe("task assignees", () => {
  async function setupTaskWithUsers() {
    const { boardId, todoColId } = await createBoardWithColumns();
    await ctx.client.exec(
      `INSERT INTO "user" (id, name, email) VALUES
        ('u_alice', 'Alice', 'a@x.io'),
        ('u_bob',   'Bob',   'b@x.io'),
        ('u_root',  'Root',  'r@x.io')
       ON CONFLICT (id) DO NOTHING`,
    );
    const task = await createTask(boardId, { title: "T", columnId: todoColId }, "u_root");
    return { boardId, taskId: task!.id };
  }

  it("createTask with assigneeIds inserts assignee rows", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await ctx.client.exec(
      `INSERT INTO "user" (id, name, email) VALUES
        ('u_alice', 'Alice', 'a@x.io'),
        ('u_bob',   'Bob',   'b@x.io')
       ON CONFLICT (id) DO NOTHING`,
    );
    const task = await createTask(
      boardId,
      { title: "T", columnId: todoColId, assigneeIds: ["u_alice", "u_bob"] },
      "u_alice",
    );
    expect(task!.assignees.map((a) => a.userId).sort()).toEqual(["u_alice", "u_bob"]);
  });

  it("getTaskDetail hydrates assignees with user names", async () => {
    const { taskId } = await setupTaskWithUsers();
    await addAssignee(taskId, "u_alice", "u_root");
    const detail = await getTaskDetail(taskId);
    expect(detail!.assignees).toHaveLength(1);
    expect(detail!.assignees[0]!.userId).toBe("u_alice");
    expect(detail!.assignees[0]!.name).toBe("Alice");
  });

  it("addAssignee is idempotent", async () => {
    const { taskId } = await setupTaskWithUsers();
    await addAssignee(taskId, "u_alice", "u_root");
    await addAssignee(taskId, "u_alice", "u_root");
    const detail = await getTaskDetail(taskId);
    expect(detail!.assignees).toHaveLength(1);
  });

  it("removeAssignee removes the row", async () => {
    const { taskId } = await setupTaskWithUsers();
    await addAssignee(taskId, "u_alice", "u_root");
    await addAssignee(taskId, "u_bob", "u_root");
    await removeAssignee(taskId, "u_alice");
    const detail = await getTaskDetail(taskId);
    expect(detail!.assignees.map((a) => a.userId)).toEqual(["u_bob"]);
  });

  it("updateTask with assigneeIds replaces the assignee set", async () => {
    const { taskId } = await setupTaskWithUsers();
    await addAssignee(taskId, "u_alice", "u_root");
    await updateTask(
      taskId,
      { assigneeIds: ["u_bob"] },
      "u_root",
    );
    const detail = await getTaskDetail(taskId);
    expect(detail!.assignees.map((a) => a.userId)).toEqual(["u_bob"]);
  });

  it("listTasks includes assignees per row", async () => {
    const { boardId, taskId } = await setupTaskWithUsers();
    await addAssignee(taskId, "u_alice", "u_root");
    await addAssignee(taskId, "u_bob", "u_root");
    const list = await listTasks(boardId);
    expect(list[0]!.assignees.map((a) => a.userId).sort()).toEqual(["u_alice", "u_bob"]);
  });

  it("listTasks with assigneeId filter returns matching tasks", async () => {
    const { boardId, taskId } = await setupTaskWithUsers();
    await addAssignee(taskId, "u_alice", "u_root");
    const filtered = await listTasks(boardId, { assigneeId: "u_alice" });
    expect(filtered).toHaveLength(1);
    const empty = await listTasks(boardId, { assigneeId: "u_bob" });
    expect(empty).toHaveLength(0);
  });
});
