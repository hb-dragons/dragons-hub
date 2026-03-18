import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";

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
  listBoards,
  createBoard,
  getBoard,
  updateBoard,
  deleteBoard,
  addColumn,
  updateColumn,
  deleteColumn,
  reorderColumns,
} from "./board.service";

// --- PGlite setup ---

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

// --- Tests ---

describe("listBoards", () => {
  it("returns empty array when no boards exist", async () => {
    const result = await listBoards();
    expect(result).toEqual([]);
  });

  it("returns all boards with summary fields", async () => {
    await ctx.client.exec(
      "INSERT INTO boards (name, description) VALUES ('Board 1', 'Desc 1'), ('Board 2', NULL)",
    );

    const result = await listBoards();

    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe("Board 1");
    expect(result[0]!.description).toBe("Desc 1");
    expect(typeof result[0]!.createdAt).toBe("string");
    expect(result[1]!.name).toBe("Board 2");
    expect(result[1]!.description).toBeNull();
  });

  it("orders boards by id ascending", async () => {
    await ctx.client.exec(
      "INSERT INTO boards (name) VALUES ('Zebra'), ('Alpha')",
    );

    const result = await listBoards();

    expect(result[0]!.name).toBe("Zebra");
    expect(result[1]!.name).toBe("Alpha");
  });
});

describe("createBoard", () => {
  it("creates board with default columns", async () => {
    const result = await createBoard("Sprint Board", "Weekly sprint");

    expect(result.name).toBe("Sprint Board");
    expect(result.description).toBe("Weekly sprint");
    expect(result.createdBy).toBeNull();
    expect(result.columns).toHaveLength(3);
    expect(result.columns[0]!.name).toBe("To Do");
    expect(result.columns[0]!.position).toBe(0);
    expect(result.columns[0]!.isDoneColumn).toBe(false);
    expect(result.columns[1]!.name).toBe("In Progress");
    expect(result.columns[1]!.position).toBe(1);
    expect(result.columns[2]!.name).toBe("Done");
    expect(result.columns[2]!.position).toBe(2);
    expect(result.columns[2]!.isDoneColumn).toBe(true);
  });

  it("creates board with createdBy", async () => {
    const result = await createBoard("Board", null, "admin");
    expect(result.createdBy).toBe("admin");
  });

  it("creates board with null description when omitted", async () => {
    const result = await createBoard("Board");
    expect(result.description).toBeNull();
    expect(result.createdBy).toBeNull();
  });
});

describe("getBoard", () => {
  it("returns board with columns ordered by position", async () => {
    const board = await createBoard("Test Board");

    const result = await getBoard(board.id);

    expect(result).not.toBeNull();
    expect(result!.name).toBe("Test Board");
    expect(result!.columns).toHaveLength(3);
    expect(result!.columns[0]!.position).toBe(0);
    expect(result!.columns[1]!.position).toBe(1);
    expect(result!.columns[2]!.position).toBe(2);
  });

  it("returns null for non-existent board", async () => {
    const result = await getBoard(999);
    expect(result).toBeNull();
  });
});

describe("updateBoard", () => {
  it("updates board name", async () => {
    const board = await createBoard("Old Name");

    const result = await updateBoard(board.id, { name: "New Name" });

    expect(result).not.toBeNull();
    expect(result!.name).toBe("New Name");
    expect(result!.columns).toHaveLength(3);
  });

  it("updates board description", async () => {
    const board = await createBoard("Board", "Old desc");

    const result = await updateBoard(board.id, { description: "New desc" });

    expect(result!.description).toBe("New desc");
  });

  it("sets description to null", async () => {
    const board = await createBoard("Board", "Has desc");

    const result = await updateBoard(board.id, { description: null });

    expect(result!.description).toBeNull();
  });

  it("returns null for non-existent board", async () => {
    const result = await updateBoard(999, { name: "Whatever" });
    expect(result).toBeNull();
  });
});

describe("deleteBoard", () => {
  it("deletes existing board", async () => {
    const board = await createBoard("To Delete");

    const result = await deleteBoard(board.id);

    expect(result).toBe(true);
    expect(await getBoard(board.id)).toBeNull();
  });

  it("returns false for non-existent board", async () => {
    const result = await deleteBoard(999);
    expect(result).toBe(false);
  });

  it("cascades delete to columns", async () => {
    const board = await createBoard("Board");
    await deleteBoard(board.id);

    const cols = await ctx.client.query(
      "SELECT COUNT(*) as cnt FROM board_columns WHERE board_id = $1",
      [board.id],
    );
    expect((cols.rows[0] as { cnt: number }).cnt).toBe(0);
  });
});

describe("addColumn", () => {
  it("adds column with auto-incremented position", async () => {
    const board = await createBoard("Board");

    const result = await addColumn(board.id, { name: "Review" });

    expect(result).not.toBeNull();
    expect(result!.name).toBe("Review");
    expect(result!.position).toBe(3); // After the 3 defaults (0, 1, 2)
    expect(result!.color).toBeNull();
    expect(result!.isDoneColumn).toBe(false);
  });

  it("adds column with color and isDoneColumn", async () => {
    const board = await createBoard("Board");

    const result = await addColumn(board.id, {
      name: "Archive",
      color: "#cccccc",
      isDoneColumn: true,
    });

    expect(result!.color).toBe("#cccccc");
    expect(result!.isDoneColumn).toBe(true);
  });

  it("returns null for non-existent board", async () => {
    const result = await addColumn(999, { name: "Col" });
    expect(result).toBeNull();
  });

  it("adds first column at position 0 when board has no columns", async () => {
    await ctx.client.exec("INSERT INTO boards (name) VALUES ('Empty Board')");

    const result = await addColumn(1, { name: "First" });

    expect(result!.position).toBe(0);
  });
});

describe("updateColumn", () => {
  it("updates column name", async () => {
    const board = await createBoard("Board");
    const colId = board.columns[0]!.id;

    const result = await updateColumn(board.id, colId, { name: "Updated" });

    expect(result).not.toBeNull();
    expect(result!.name).toBe("Updated");
  });

  it("updates column position", async () => {
    const board = await createBoard("Board");
    const colId = board.columns[0]!.id;

    const result = await updateColumn(board.id, colId, { position: 5 });

    expect(result!.position).toBe(5);
  });

  it("updates column color", async () => {
    const board = await createBoard("Board");
    const colId = board.columns[0]!.id;

    const result = await updateColumn(board.id, colId, { color: "#ff0000" });

    expect(result!.color).toBe("#ff0000");
  });

  it("sets column color to null", async () => {
    const board = await createBoard("Board");
    const colId = board.columns[0]!.id;
    await updateColumn(board.id, colId, { color: "#ff0000" });

    const result = await updateColumn(board.id, colId, { color: null });

    expect(result!.color).toBeNull();
  });

  it("updates isDoneColumn", async () => {
    const board = await createBoard("Board");
    const colId = board.columns[0]!.id;

    const result = await updateColumn(board.id, colId, { isDoneColumn: true });

    expect(result!.isDoneColumn).toBe(true);
  });

  it("returns null for non-existent column", async () => {
    const board = await createBoard("Board");

    const result = await updateColumn(board.id, 999, { name: "Whatever" });

    expect(result).toBeNull();
  });

  it("returns null when column belongs to different board", async () => {
    const board1 = await createBoard("Board 1");
    const board2 = await createBoard("Board 2");
    const colId = board2.columns[0]!.id;

    const result = await updateColumn(board1.id, colId, { name: "Trick" });

    expect(result).toBeNull();
  });
});

describe("deleteColumn", () => {
  it("deletes column with no tasks", async () => {
    const board = await createBoard("Board");
    const colId = board.columns[0]!.id;

    const result = await deleteColumn(board.id, colId);

    expect(result).toBe(true);
  });

  it("returns false when column has tasks", async () => {
    const board = await createBoard("Board");
    const colId = board.columns[0]!.id;

    await ctx.client.exec(
      `INSERT INTO tasks (board_id, column_id, title) VALUES (${board.id}, ${colId}, 'Task 1')`,
    );

    const result = await deleteColumn(board.id, colId);

    expect(result).toBe(false);
  });

  it("returns false for non-existent column", async () => {
    const board = await createBoard("Board");

    const result = await deleteColumn(board.id, 999);

    expect(result).toBe(false);
  });

  it("returns false when column belongs to different board", async () => {
    const board1 = await createBoard("Board 1");
    const board2 = await createBoard("Board 2");
    const colId = board2.columns[0]!.id;

    const result = await deleteColumn(board1.id, colId);

    expect(result).toBe(false);
  });
});

describe("reorderColumns", () => {
  it("reorders columns by setting new positions", async () => {
    const board = await createBoard("Board");

    await reorderColumns(board.id, [
      { id: board.columns[2]!.id, position: 0 },
      { id: board.columns[0]!.id, position: 1 },
      { id: board.columns[1]!.id, position: 2 },
    ]);

    const updated = await getBoard(board.id);
    expect(updated!.columns[0]!.id).toBe(board.columns[2]!.id);
    expect(updated!.columns[0]!.position).toBe(0);
    expect(updated!.columns[1]!.id).toBe(board.columns[0]!.id);
    expect(updated!.columns[1]!.position).toBe(1);
  });

  it("handles empty positions array", async () => {
    const board = await createBoard("Board");

    await reorderColumns(board.id, []);

    const updated = await getBoard(board.id);
    expect(updated!.columns[0]!.position).toBe(0);
  });
});
