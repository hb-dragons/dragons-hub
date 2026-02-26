import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  listBoards: vi.fn(),
  createBoard: vi.fn(),
  getBoard: vi.fn(),
  updateBoard: vi.fn(),
  deleteBoard: vi.fn(),
  addColumn: vi.fn(),
  updateColumn: vi.fn(),
  deleteColumn: vi.fn(),
  reorderColumns: vi.fn(),
}));

vi.mock("../../services/admin/board.service", () => ({
  listBoards: mocks.listBoards,
  createBoard: mocks.createBoard,
  getBoard: mocks.getBoard,
  updateBoard: mocks.updateBoard,
  deleteBoard: mocks.deleteBoard,
  addColumn: mocks.addColumn,
  updateColumn: mocks.updateColumn,
  deleteColumn: mocks.deleteColumn,
  reorderColumns: mocks.reorderColumns,
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

// --- Imports (after mocks) ---

import { boardRoutes } from "./board.routes";
import { errorHandler } from "../../middleware/error";

// Test app without auth middleware
const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", boardRoutes);

function json(response: Response) {
  return response.json();
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /boards", () => {
  it("returns all boards", async () => {
    const boards = [
      { id: 1, name: "Board 1", description: null, createdAt: "2025-01-01T00:00:00Z" },
    ];
    mocks.listBoards.mockResolvedValue(boards);

    const res = await app.request("/boards");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(boards);
    expect(mocks.listBoards).toHaveBeenCalledOnce();
  });

  it("returns empty array when no boards exist", async () => {
    mocks.listBoards.mockResolvedValue([]);

    const res = await app.request("/boards");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual([]);
  });
});

describe("POST /boards", () => {
  it("creates board and returns 201", async () => {
    const board = { id: 1, name: "Sprint", description: null, columns: [] };
    mocks.createBoard.mockResolvedValue(board);

    const res = await app.request("/boards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Sprint" }),
    });

    expect(res.status).toBe(201);
    expect(await json(res)).toEqual(board);
    expect(mocks.createBoard).toHaveBeenCalledWith("Sprint", undefined, undefined);
  });

  it("passes description and createdBy to service", async () => {
    mocks.createBoard.mockResolvedValue({ id: 1, name: "Board" });

    await app.request("/boards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Board", description: "Desc", createdBy: "admin" }),
    });

    expect(mocks.createBoard).toHaveBeenCalledWith("Board", "Desc", "admin");
  });

  it("returns 400 for missing name", async () => {
    const res = await app.request("/boards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for empty name", async () => {
    const res = await app.request("/boards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("GET /boards/:id", () => {
  it("returns board with columns", async () => {
    const board = { id: 1, name: "Board", columns: [{ id: 1, name: "To Do" }] };
    mocks.getBoard.mockResolvedValue(board);

    const res = await app.request("/boards/1");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(board);
    expect(mocks.getBoard).toHaveBeenCalledWith(1);
  });

  it("returns 404 when board not found", async () => {
    mocks.getBoard.mockResolvedValue(null);

    const res = await app.request("/boards/999");

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for invalid id", async () => {
    const res = await app.request("/boards/0");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for non-numeric id", async () => {
    const res = await app.request("/boards/abc");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("PATCH /boards/:id", () => {
  it("updates board and returns result", async () => {
    const board = { id: 1, name: "Updated", columns: [] };
    mocks.updateBoard.mockResolvedValue(board);

    const res = await app.request("/boards/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(board);
    expect(mocks.updateBoard).toHaveBeenCalledWith(1, { name: "Updated" });
  });

  it("returns 404 when board not found", async () => {
    mocks.updateBoard.mockResolvedValue(null);

    const res = await app.request("/boards/999", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test" }),
    });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for invalid id", async () => {
    const res = await app.request("/boards/0", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for empty name", async () => {
    const res = await app.request("/boards/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("DELETE /boards/:id", () => {
  it("deletes board and returns success", async () => {
    mocks.deleteBoard.mockResolvedValue(true);

    const res = await app.request("/boards/1", { method: "DELETE" });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ success: true });
    expect(mocks.deleteBoard).toHaveBeenCalledWith(1);
  });

  it("returns 404 when board not found", async () => {
    mocks.deleteBoard.mockResolvedValue(false);

    const res = await app.request("/boards/999", { method: "DELETE" });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for invalid id", async () => {
    const res = await app.request("/boards/abc", { method: "DELETE" });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("POST /boards/:id/columns", () => {
  it("adds column and returns 201", async () => {
    const column = { id: 4, name: "Review", position: 3, color: null, isDoneColumn: false };
    mocks.addColumn.mockResolvedValue(column);

    const res = await app.request("/boards/1/columns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Review" }),
    });

    expect(res.status).toBe(201);
    expect(await json(res)).toEqual(column);
    expect(mocks.addColumn).toHaveBeenCalledWith(1, { name: "Review" });
  });

  it("passes color and isDoneColumn to service", async () => {
    mocks.addColumn.mockResolvedValue({ id: 4, name: "Done", position: 3 });

    await app.request("/boards/1/columns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Done", color: "#00ff00", isDoneColumn: true }),
    });

    expect(mocks.addColumn).toHaveBeenCalledWith(1, {
      name: "Done",
      color: "#00ff00",
      isDoneColumn: true,
    });
  });

  it("returns 404 when board not found", async () => {
    mocks.addColumn.mockResolvedValue(null);

    const res = await app.request("/boards/999/columns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Review" }),
    });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for missing name", async () => {
    const res = await app.request("/boards/1/columns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for invalid board id", async () => {
    const res = await app.request("/boards/abc/columns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Review" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for invalid color format", async () => {
    const res = await app.request("/boards/1/columns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Col", color: "red" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("PATCH /boards/:id/columns/reorder", () => {
  it("reorders columns and returns success", async () => {
    mocks.reorderColumns.mockResolvedValue(undefined);

    const res = await app.request("/boards/1/columns/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        columns: [
          { id: 1, position: 2 },
          { id: 2, position: 0 },
          { id: 3, position: 1 },
        ],
      }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ success: true });
    expect(mocks.reorderColumns).toHaveBeenCalledWith(1, [
      { id: 1, position: 2 },
      { id: 2, position: 0 },
      { id: 3, position: 1 },
    ]);
  });

  it("returns 400 for empty columns array", async () => {
    const res = await app.request("/boards/1/columns/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columns: [] }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for invalid board id", async () => {
    const res = await app.request("/boards/0/columns/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columns: [{ id: 1, position: 0 }] }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("PATCH /boards/:id/columns/:colId", () => {
  it("updates column and returns result", async () => {
    const column = { id: 1, name: "Updated", position: 0, color: null, isDoneColumn: false };
    mocks.updateColumn.mockResolvedValue(column);

    const res = await app.request("/boards/1/columns/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(column);
    expect(mocks.updateColumn).toHaveBeenCalledWith(1, 1, { name: "Updated" });
  });

  it("returns 404 when column not found", async () => {
    mocks.updateColumn.mockResolvedValue(null);

    const res = await app.request("/boards/1/columns/999", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test" }),
    });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for invalid board id", async () => {
    const res = await app.request("/boards/0/columns/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for invalid column id", async () => {
    const res = await app.request("/boards/1/columns/0", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for invalid color", async () => {
    const res = await app.request("/boards/1/columns/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color: "bad" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("DELETE /boards/:id/columns/:colId", () => {
  it("deletes column and returns success", async () => {
    mocks.deleteColumn.mockResolvedValue(true);

    const res = await app.request("/boards/1/columns/1", { method: "DELETE" });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ success: true });
    expect(mocks.deleteColumn).toHaveBeenCalledWith(1, 1);
  });

  it("returns 404 when column not found or has tasks", async () => {
    mocks.deleteColumn.mockResolvedValue(false);

    const res = await app.request("/boards/1/columns/1", { method: "DELETE" });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for invalid board id", async () => {
    const res = await app.request("/boards/abc/columns/1", { method: "DELETE" });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for invalid column id", async () => {
    const res = await app.request("/boards/1/columns/abc", { method: "DELETE" });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
