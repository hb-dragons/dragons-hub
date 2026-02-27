import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";

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
} from "./task.service";

// --- PGlite setup ---

const CREATE_TABLES = `
  CREATE TABLE venues (
    id SERIAL PRIMARY KEY,
    api_id INTEGER NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    street VARCHAR(200),
    postal_code VARCHAR(10),
    city VARCHAR(100),
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    data_hash VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE venue_bookings (
    id SERIAL PRIMARY KEY,
    venue_id INTEGER NOT NULL REFERENCES venues(id),
    date DATE NOT NULL,
    calculated_start_time TIME NOT NULL,
    calculated_end_time TIME NOT NULL,
    override_start_time TIME,
    override_end_time TIME,
    override_reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    needs_reconfirmation BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    confirmed_by TEXT,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE boards (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE board_columns (
    id SERIAL PRIMARY KEY,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    color VARCHAR(7),
    is_done_column BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    column_id INTEGER NOT NULL REFERENCES board_columns(id),
    title VARCHAR(300) NOT NULL,
    description TEXT,
    assignee_id TEXT,
    priority VARCHAR(10) NOT NULL DEFAULT 'normal',
    due_date DATE,
    position INTEGER NOT NULL DEFAULT 0,
    match_id INTEGER,
    venue_booking_id INTEGER REFERENCES venue_bookings(id),
    source_type VARCHAR(20) NOT NULL DEFAULT 'manual',
    source_detail TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE task_checklist_items (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    label VARCHAR(200) NOT NULL,
    is_checked BOOLEAN NOT NULL DEFAULT FALSE,
    checked_by TEXT,
    checked_at TIMESTAMPTZ,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE task_comments (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE teams (
    id SERIAL PRIMARY KEY,
    api_team_permanent_id INTEGER NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    short_name VARCHAR(100),
    custom_name VARCHAR(200),
    is_own_club BOOLEAN NOT NULL DEFAULT FALSE,
    liga_id INTEGER,
    data_hash VARCHAR(64),
    estimated_game_duration INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE matches (
    id SERIAL PRIMARY KEY,
    api_match_id INTEGER NOT NULL UNIQUE,
    liga_id INTEGER NOT NULL,
    match_no INTEGER NOT NULL DEFAULT 0,
    matchday INTEGER,
    kickoff_date DATE,
    kickoff_time TIME,
    home_team_api_id INTEGER,
    guest_team_api_id INTEGER,
    venue_id INTEGER REFERENCES venues(id),
    home_score INTEGER,
    guest_score INTEGER,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    data_hash VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE venue_booking_matches (
    id SERIAL PRIMARY KEY,
    venue_booking_id INTEGER NOT NULL REFERENCES venue_bookings(id) ON DELETE CASCADE,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(venue_booking_id, match_id)
  );
`;

let client: PGlite;

beforeAll(async () => {
  const pglite = await import("@electric-sql/pglite");
  const drizzlePglite = await import("drizzle-orm/pglite");

  client = new pglite.PGlite();
  dbHolder.ref = drizzlePglite.drizzle(client);

  await client.exec(CREATE_TABLES);
});

beforeEach(async () => {
  await client.exec("DELETE FROM venue_booking_matches");
  await client.exec("DELETE FROM task_comments");
  await client.exec("DELETE FROM task_checklist_items");
  await client.exec("DELETE FROM tasks");
  await client.exec("DELETE FROM board_columns");
  await client.exec("DELETE FROM boards");
  await client.exec("DELETE FROM matches");
  await client.exec("DELETE FROM venue_bookings");
  await client.exec("DELETE FROM venues");
  await client.exec("DELETE FROM teams");
  await client.exec("ALTER SEQUENCE boards_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE board_columns_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE tasks_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE task_checklist_items_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE task_comments_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE venues_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE venue_bookings_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE matches_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE venue_booking_matches_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE teams_id_seq RESTART WITH 1");
  vi.clearAllMocks();
});

afterAll(async () => {
  await client.close();
});

// --- Helpers ---

async function createBoardWithColumns() {
  await client.exec("INSERT INTO boards (name) VALUES ('Test Board')");
  await client.exec(`
    INSERT INTO board_columns (board_id, name, position, is_done_column)
    VALUES (1, 'To Do', 0, false), (1, 'In Progress', 1, false), (1, 'Done', 2, true)
  `);
  return { boardId: 1, todoColId: 1, inProgressColId: 2, doneColId: 3 };
}

async function createVenueAndBooking() {
  await client.exec(
    "INSERT INTO venues (api_id, name) VALUES (100, 'Arena')",
  );
  await client.exec(
    "INSERT INTO venue_bookings (venue_id, date, calculated_start_time, calculated_end_time, status) VALUES (1, '2025-06-01', '18:00', '20:00', 'pending')",
  );
  return { venueId: 1, bookingId: 1 };
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
    await client.exec(
      `INSERT INTO tasks (board_id, column_id, title) VALUES (${boardId}, ${todoColId}, 'Task 1')`,
    );
    await client.exec(
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
    await client.exec(
      `INSERT INTO tasks (board_id, column_id, title) VALUES (${boardId}, ${todoColId}, 'Task')`,
    );

    const result = await listTasks(boardId);

    expect(result[0]!.checklistTotal).toBe(0);
    expect(result[0]!.checklistChecked).toBe(0);
  });

  it("filters by columnId", async () => {
    const { boardId, todoColId, inProgressColId } = await createBoardWithColumns();
    await client.exec(
      `INSERT INTO tasks (board_id, column_id, title) VALUES (${boardId}, ${todoColId}, 'Todo'), (${boardId}, ${inProgressColId}, 'InProg')`,
    );

    const result = await listTasks(boardId, { columnId: todoColId });

    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe("Todo");
  });

  it("filters by assigneeId", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await client.exec(
      `INSERT INTO tasks (board_id, column_id, title, assignee_id) VALUES (${boardId}, ${todoColId}, 'Mine', 'user-1'), (${boardId}, ${todoColId}, 'Theirs', 'user-2')`,
    );

    const result = await listTasks(boardId, { assigneeId: "user-1" });

    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe("Mine");
  });

  it("filters by priority", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await client.exec(
      `INSERT INTO tasks (board_id, column_id, title, priority) VALUES (${boardId}, ${todoColId}, 'Normal', 'normal'), (${boardId}, ${todoColId}, 'Urgent', 'urgent')`,
    );

    const result = await listTasks(boardId, { priority: "urgent" });

    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe("Urgent");
  });

  it("orders by position then id", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await client.exec(
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
    });

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

    const result = await createTask(boardId, {
      title: "Full Task",
      columnId: todoColId,
      description: "Details here",
      assigneeId: "user-1",
      priority: "high",
      dueDate: "2025-06-01",
      matchId: 10,
      venueBookingId: null,
    });

    expect(result!.description).toBe("Details here");
    expect(result!.assigneeId).toBe("user-1");
    expect(result!.priority).toBe("high");
    expect(result!.dueDate).toBe("2025-06-01");
    expect(result!.matchId).toBe(10);
  });

  it("auto-increments position within column", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();

    const task1 = await createTask(boardId, { title: "First", columnId: todoColId });
    const task2 = await createTask(boardId, { title: "Second", columnId: todoColId });

    expect(task1!.position).toBe(0);
    expect(task2!.position).toBe(1);
  });

  it("returns null for non-existent board", async () => {
    const result = await createTask(999, { title: "Task", columnId: 1 });
    expect(result).toBeNull();
  });

  it("returns null for non-existent column", async () => {
    const { boardId } = await createBoardWithColumns();
    const result = await createTask(boardId, { title: "Task", columnId: 999 });
    expect(result).toBeNull();
  });

  it("returns null for column belonging to different board", async () => {
    await createBoardWithColumns();
    await client.exec("INSERT INTO boards (name) VALUES ('Board 2')");
    await client.exec(
      "INSERT INTO board_columns (board_id, name, position) VALUES (2, 'Col', 0)",
    );

    // Column 4 belongs to board 2, try to use it with board 1
    const result = await createTask(1, { title: "Task", columnId: 4 });
    expect(result).toBeNull();
  });
});

describe("getTaskDetail", () => {
  it("returns task with checklist and comments", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task 1", columnId: todoColId });

    await client.exec(
      "INSERT INTO task_checklist_items (task_id, label, position) VALUES (1, 'Item 1', 0)",
    );
    await client.exec(
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
    await createTask(boardId, { title: "Bare Task", columnId: todoColId });

    const result = await getTaskDetail(1);

    expect(result!.checklist).toEqual([]);
    expect(result!.comments).toEqual([]);
    expect(result!.booking).toBeNull();
  });
});

describe("updateTask", () => {
  it("updates task title", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Old", columnId: todoColId });

    const result = await updateTask(1, { title: "New" });

    expect(result).not.toBeNull();
    expect(result!.title).toBe("New");
  });

  it("updates task description", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId });

    const result = await updateTask(1, { description: "Updated desc" });

    expect(result!.description).toBe("Updated desc");
  });

  it("clears description with null", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, {
      title: "Task",
      columnId: todoColId,
      description: "Has desc",
    });

    const result = await updateTask(1, { description: null });

    expect(result!.description).toBeNull();
  });

  it("returns null for non-existent task", async () => {
    const result = await updateTask(999, { title: "Nothing" });
    expect(result).toBeNull();
  });
});

describe("moveTask", () => {
  it("moves task to new column and position", async () => {
    const { boardId, todoColId, inProgressColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId });

    const result = await moveTask(1, inProgressColId, 0);

    expect(result).not.toBeNull();
    expect(result!.columnId).toBe(inProgressColId);
    expect(result!.position).toBe(0);
  });

  it("updates venue booking when moved to done column", async () => {
    const { boardId, todoColId, doneColId } = await createBoardWithColumns();
    await createVenueAndBooking();

    await client.exec(
      `INSERT INTO tasks (board_id, column_id, title, venue_booking_id) VALUES (${boardId}, ${todoColId}, 'Booking Task', 1)`,
    );

    await moveTask(1, doneColId, 0);

    const booking = await client.query(
      "SELECT status, needs_reconfirmation, confirmed_at FROM venue_bookings WHERE id = 1",
    );
    const row = booking.rows[0] as {
      status: string;
      needs_reconfirmation: boolean;
      confirmed_at: Date | null;
    };
    expect(row.status).toBe("confirmed");
    expect(row.needs_reconfirmation).toBe(false);
    expect(row.confirmed_at).not.toBeNull();
  });

  it("does not update booking when moved to non-done column", async () => {
    const { boardId, todoColId, inProgressColId } = await createBoardWithColumns();
    await createVenueAndBooking();

    await client.exec(
      `INSERT INTO tasks (board_id, column_id, title, venue_booking_id) VALUES (${boardId}, ${todoColId}, 'Booking Task', 1)`,
    );

    await moveTask(1, inProgressColId, 0);

    const booking = await client.query(
      "SELECT status FROM venue_bookings WHERE id = 1",
    );
    expect((booking.rows[0] as { status: string }).status).toBe("pending");
  });

  it("does not update booking when task has no venueBookingId", async () => {
    const { boardId, todoColId, doneColId } = await createBoardWithColumns();

    await client.exec(
      `INSERT INTO tasks (board_id, column_id, title) VALUES (${boardId}, ${todoColId}, 'Plain Task')`,
    );

    const result = await moveTask(1, doneColId, 0);

    expect(result).not.toBeNull();
    expect(result!.columnId).toBe(doneColId);
  });

  it("returns null for non-existent task", async () => {
    await createBoardWithColumns();
    const result = await moveTask(999, 1, 0);
    expect(result).toBeNull();
  });

  it("returns null for non-existent column", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId });

    const result = await moveTask(1, 999, 0);
    expect(result).toBeNull();
  });
});

describe("deleteTask", () => {
  it("deletes existing task", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "To Delete", columnId: todoColId });

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
    await createTask(boardId, { title: "Task", columnId: todoColId });
    await addChecklistItem(1, { label: "Item" });
    await addComment(1, { body: "Comment", authorId: "user-1" });

    await deleteTask(1);

    const items = await client.query(
      "SELECT COUNT(*) as cnt FROM task_checklist_items WHERE task_id = 1",
    );
    expect((items.rows[0] as { cnt: number }).cnt).toBe(0);

    const comments = await client.query(
      "SELECT COUNT(*) as cnt FROM task_comments WHERE task_id = 1",
    );
    expect((comments.rows[0] as { cnt: number }).cnt).toBe(0);
  });
});

describe("addChecklistItem", () => {
  it("adds item with auto-incremented position", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId });

    const item1 = await addChecklistItem(1, { label: "Step 1" });
    const item2 = await addChecklistItem(1, { label: "Step 2" });

    expect(item1!.label).toBe("Step 1");
    expect(item1!.position).toBe(0);
    expect(item1!.isChecked).toBe(false);
    expect(item2!.position).toBe(1);
  });

  it("adds item with explicit position", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId });

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
    await createTask(boardId, { title: "Task", columnId: todoColId });
    await addChecklistItem(1, { label: "Old" });

    const result = await updateChecklistItem(1, 1, { label: "New" });

    expect(result!.label).toBe("New");
  });

  it("checks item and sets checkedAt", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId });
    await addChecklistItem(1, { label: "Item" });

    const result = await updateChecklistItem(1, 1, {
      isChecked: true,
      checkedBy: "admin",
    });

    expect(result!.isChecked).toBe(true);
    expect(result!.checkedBy).toBe("admin");
    expect(result!.checkedAt).not.toBeNull();
  });

  it("unchecks item and clears checkedAt and checkedBy", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId });
    await addChecklistItem(1, { label: "Item" });
    await updateChecklistItem(1, 1, { isChecked: true, checkedBy: "admin" });

    const result = await updateChecklistItem(1, 1, { isChecked: false });

    expect(result!.isChecked).toBe(false);
    expect(result!.checkedBy).toBeNull();
    expect(result!.checkedAt).toBeNull();
  });

  it("updates checkedBy without changing isChecked", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId });
    await addChecklistItem(1, { label: "Item" });

    const result = await updateChecklistItem(1, 1, { checkedBy: "user-1" });

    expect(result!.checkedBy).toBe("user-1");
  });

  it("returns null for non-existent item", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId });

    const result = await updateChecklistItem(1, 999, { label: "X" });

    expect(result).toBeNull();
  });

  it("returns null when item belongs to different task", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task 1", columnId: todoColId });
    await createTask(boardId, { title: "Task 2", columnId: todoColId });
    await addChecklistItem(2, { label: "Item" });

    // Item 1 belongs to task 2, try to update via task 1
    const result = await updateChecklistItem(1, 1, { label: "Hack" });

    expect(result).toBeNull();
  });

  it("checks item without specifying checkedBy", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId });
    await addChecklistItem(1, { label: "Item" });

    const result = await updateChecklistItem(1, 1, { isChecked: true });

    expect(result!.isChecked).toBe(true);
    expect(result!.checkedAt).not.toBeNull();
    // checkedBy stays null since not provided
    expect(result!.checkedBy).toBeNull();
  });
});

describe("deleteChecklistItem", () => {
  it("deletes existing item", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId });
    await addChecklistItem(1, { label: "Item" });

    const result = await deleteChecklistItem(1, 1);

    expect(result).toBe(true);
  });

  it("returns false for non-existent item", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId });

    const result = await deleteChecklistItem(1, 999);

    expect(result).toBe(false);
  });

  it("returns false when item belongs to different task", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task 1", columnId: todoColId });
    await createTask(boardId, { title: "Task 2", columnId: todoColId });
    await addChecklistItem(2, { label: "Item" });

    const result = await deleteChecklistItem(1, 1);

    expect(result).toBe(false);
  });
});

describe("addComment", () => {
  it("adds comment to task", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId });

    const result = await addComment(1, { body: "Nice!", authorId: "user-1" });

    expect(result).not.toBeNull();
    expect(result!.body).toBe("Nice!");
    expect(result!.authorId).toBe("user-1");
    expect(typeof result!.createdAt).toBe("string");
  });

  it("returns null for non-existent task", async () => {
    const result = await addComment(999, { body: "Text", authorId: "user-1" });
    expect(result).toBeNull();
  });
});

describe("updateComment", () => {
  it("updates comment body", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId });
    await addComment(1, { body: "Old", authorId: "user-1" });

    const result = await updateComment(1, 1, { body: "New" });

    expect(result!.body).toBe("New");
    expect(result!.authorId).toBe("user-1");
  });

  it("returns null for non-existent comment", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId });

    const result = await updateComment(1, 999, { body: "X" });

    expect(result).toBeNull();
  });

  it("returns null when comment belongs to different task", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task 1", columnId: todoColId });
    await createTask(boardId, { title: "Task 2", columnId: todoColId });
    await addComment(2, { body: "Text", authorId: "user-1" });

    const result = await updateComment(1, 1, { body: "Hack" });

    expect(result).toBeNull();
  });
});

describe("deleteComment", () => {
  it("deletes existing comment", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId });
    await addComment(1, { body: "To delete", authorId: "user-1" });

    const result = await deleteComment(1, 1);

    expect(result).toBe(true);
  });

  it("returns false for non-existent comment", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task", columnId: todoColId });

    const result = await deleteComment(1, 999);

    expect(result).toBe(false);
  });

  it("returns false when comment belongs to different task", async () => {
    const { boardId, todoColId } = await createBoardWithColumns();
    await createTask(boardId, { title: "Task 1", columnId: todoColId });
    await createTask(boardId, { title: "Task 2", columnId: todoColId });
    await addComment(2, { body: "Text", authorId: "user-1" });

    const result = await deleteComment(1, 1);

    expect(result).toBe(false);
  });
});
