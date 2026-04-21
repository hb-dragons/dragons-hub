import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  listTasks: vi.fn(),
  createTask: vi.fn(),
  getTaskDetail: vi.fn(),
  updateTask: vi.fn(),
  moveTask: vi.fn(),
  deleteTask: vi.fn(),
  addChecklistItem: vi.fn(),
  updateChecklistItem: vi.fn(),
  deleteChecklistItem: vi.fn(),
  addComment: vi.fn(),
  updateComment: vi.fn(),
  deleteComment: vi.fn(),
}));

vi.mock("../../services/admin/task.service", () => ({
  listTasks: mocks.listTasks,
  createTask: mocks.createTask,
  getTaskDetail: mocks.getTaskDetail,
  updateTask: mocks.updateTask,
  moveTask: mocks.moveTask,
  deleteTask: mocks.deleteTask,
  addChecklistItem: mocks.addChecklistItem,
  updateChecklistItem: mocks.updateChecklistItem,
  deleteChecklistItem: mocks.deleteChecklistItem,
  addComment: mocks.addComment,
  updateComment: mocks.updateComment,
  deleteComment: mocks.deleteComment,
}));

vi.mock("../../middleware/rbac", () => ({
  requirePermission: vi.fn(() =>
    async (_c: unknown, next: () => Promise<void>) => next(),
  ),
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

// --- Imports (after mocks) ---

import { taskRoutes } from "./task.routes";
import { errorHandler } from "../../middleware/error";

// Test app without auth middleware
const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", taskRoutes);

function json(response: Response) {
  return response.json();
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Task CRUD ---

describe("GET /boards/:boardId/tasks", () => {
  it("returns tasks for board", async () => {
    const tasks = [{ id: 1, title: "Task 1", checklistTotal: 2, checklistChecked: 1 }];
    mocks.listTasks.mockResolvedValue(tasks);

    const res = await app.request("/boards/1/tasks");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(tasks);
    expect(mocks.listTasks).toHaveBeenCalledWith(1, {});
  });

  it("passes filters to service", async () => {
    mocks.listTasks.mockResolvedValue([]);

    await app.request("/boards/1/tasks?columnId=2&assigneeId=user-1&priority=high");

    expect(mocks.listTasks).toHaveBeenCalledWith(1, {
      columnId: 2,
      assigneeId: "user-1",
      priority: "high",
    });
  });

  it("returns 400 for invalid boardId", async () => {
    const res = await app.request("/boards/abc/tasks");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for invalid priority filter", async () => {
    const res = await app.request("/boards/1/tasks?priority=invalid");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns empty array when no tasks", async () => {
    mocks.listTasks.mockResolvedValue([]);

    const res = await app.request("/boards/1/tasks");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual([]);
  });
});

describe("POST /boards/:boardId/tasks", () => {
  it("creates task and returns 201", async () => {
    const task = { id: 1, title: "New Task", columnId: 1 };
    mocks.createTask.mockResolvedValue(task);

    const res = await app.request("/boards/1/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New Task", columnId: 1 }),
    });

    expect(res.status).toBe(201);
    expect(await json(res)).toEqual(task);
    expect(mocks.createTask).toHaveBeenCalledWith(1, {
      title: "New Task",
      columnId: 1,
    });
  });

  it("passes all optional fields to service", async () => {
    mocks.createTask.mockResolvedValue({ id: 1 });

    await app.request("/boards/1/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Task",
        columnId: 1,
        description: "Desc",
        assigneeId: "user-1",
        priority: "high",
        dueDate: "2025-06-01",
      }),
    });

    expect(mocks.createTask).toHaveBeenCalledWith(1, {
      title: "Task",
      columnId: 1,
      description: "Desc",
      assigneeId: "user-1",
      priority: "high",
      dueDate: "2025-06-01",
    });
  });

  it("returns 404 when board/column not found", async () => {
    mocks.createTask.mockResolvedValue(null);

    const res = await app.request("/boards/999/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Task", columnId: 1 }),
    });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for missing title", async () => {
    const res = await app.request("/boards/1/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columnId: 1 }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for missing columnId", async () => {
    const res = await app.request("/boards/1/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Task" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for invalid boardId", async () => {
    const res = await app.request("/boards/0/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Task", columnId: 1 }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for invalid dueDate", async () => {
    const res = await app.request("/boards/1/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Task", columnId: 1, dueDate: "bad" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("GET /tasks/:id", () => {
  it("returns task detail", async () => {
    const detail = { id: 1, title: "Task", checklist: [], comments: [] };
    mocks.getTaskDetail.mockResolvedValue(detail);

    const res = await app.request("/tasks/1");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(detail);
    expect(mocks.getTaskDetail).toHaveBeenCalledWith(1);
  });

  it("returns 404 when task not found", async () => {
    mocks.getTaskDetail.mockResolvedValue(null);

    const res = await app.request("/tasks/999");

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for invalid id", async () => {
    const res = await app.request("/tasks/abc");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("PATCH /tasks/:id", () => {
  it("updates task and returns detail", async () => {
    const detail = { id: 1, title: "Updated" };
    mocks.updateTask.mockResolvedValue(detail);

    const res = await app.request("/tasks/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated" }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(detail);
    expect(mocks.updateTask).toHaveBeenCalledWith(1, { title: "Updated" });
  });

  it("returns 404 when task not found", async () => {
    mocks.updateTask.mockResolvedValue(null);

    const res = await app.request("/tasks/999", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test" }),
    });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for invalid id", async () => {
    const res = await app.request("/tasks/0", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for empty title", async () => {
    const res = await app.request("/tasks/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("PATCH /tasks/:id/move", () => {
  it("moves task and returns detail", async () => {
    const detail = { id: 1, columnId: 2, position: 0 };
    mocks.moveTask.mockResolvedValue(detail);

    const res = await app.request("/tasks/1/move", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columnId: 2, position: 0 }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(detail);
    expect(mocks.moveTask).toHaveBeenCalledWith(1, 2, 0);
  });

  it("returns 404 when task or column not found", async () => {
    mocks.moveTask.mockResolvedValue(null);

    const res = await app.request("/tasks/999/move", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columnId: 1, position: 0 }),
    });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for missing columnId", async () => {
    const res = await app.request("/tasks/1/move", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ position: 0 }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for negative position", async () => {
    const res = await app.request("/tasks/1/move", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columnId: 1, position: -1 }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for invalid id", async () => {
    const res = await app.request("/tasks/abc/move", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columnId: 1, position: 0 }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("DELETE /tasks/:id", () => {
  it("deletes task and returns success", async () => {
    mocks.deleteTask.mockResolvedValue(true);

    const res = await app.request("/tasks/1", { method: "DELETE" });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ success: true });
    expect(mocks.deleteTask).toHaveBeenCalledWith(1);
  });

  it("returns 404 when task not found", async () => {
    mocks.deleteTask.mockResolvedValue(false);

    const res = await app.request("/tasks/999", { method: "DELETE" });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for invalid id", async () => {
    const res = await app.request("/tasks/abc", { method: "DELETE" });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

// --- Checklist Items ---

describe("POST /tasks/:id/checklist", () => {
  it("adds checklist item and returns 201", async () => {
    const item = { id: 1, label: "Step 1", isChecked: false, position: 0 };
    mocks.addChecklistItem.mockResolvedValue(item);

    const res = await app.request("/tasks/1/checklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Step 1" }),
    });

    expect(res.status).toBe(201);
    expect(await json(res)).toEqual(item);
    expect(mocks.addChecklistItem).toHaveBeenCalledWith(1, { label: "Step 1" });
  });

  it("passes position to service", async () => {
    mocks.addChecklistItem.mockResolvedValue({ id: 1 });

    await app.request("/tasks/1/checklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Step", position: 3 }),
    });

    expect(mocks.addChecklistItem).toHaveBeenCalledWith(1, {
      label: "Step",
      position: 3,
    });
  });

  it("returns 404 when task not found", async () => {
    mocks.addChecklistItem.mockResolvedValue(null);

    const res = await app.request("/tasks/999/checklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Item" }),
    });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for empty label", async () => {
    const res = await app.request("/tasks/1/checklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for invalid task id", async () => {
    const res = await app.request("/tasks/abc/checklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Item" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("PATCH /tasks/:id/checklist/:itemId", () => {
  it("updates checklist item", async () => {
    const item = { id: 1, label: "Updated", isChecked: true };
    mocks.updateChecklistItem.mockResolvedValue(item);

    const res = await app.request("/tasks/1/checklist/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isChecked: true }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(item);
    expect(mocks.updateChecklistItem).toHaveBeenCalledWith(1, 1, {
      isChecked: true,
    });
  });

  it("returns 404 when item not found", async () => {
    mocks.updateChecklistItem.mockResolvedValue(null);

    const res = await app.request("/tasks/1/checklist/999", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "X" }),
    });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for invalid task id", async () => {
    const res = await app.request("/tasks/0/checklist/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "X" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for invalid item id", async () => {
    const res = await app.request("/tasks/1/checklist/0", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "X" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for empty label", async () => {
    const res = await app.request("/tasks/1/checklist/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("DELETE /tasks/:id/checklist/:itemId", () => {
  it("deletes checklist item and returns success", async () => {
    mocks.deleteChecklistItem.mockResolvedValue(true);

    const res = await app.request("/tasks/1/checklist/1", { method: "DELETE" });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ success: true });
    expect(mocks.deleteChecklistItem).toHaveBeenCalledWith(1, 1);
  });

  it("returns 404 when item not found", async () => {
    mocks.deleteChecklistItem.mockResolvedValue(false);

    const res = await app.request("/tasks/1/checklist/999", { method: "DELETE" });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for invalid ids", async () => {
    const res = await app.request("/tasks/abc/checklist/1", { method: "DELETE" });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

// --- Comments ---

describe("POST /tasks/:id/comments", () => {
  it("adds comment and returns 201", async () => {
    const comment = { id: 1, body: "Great!", authorId: "user-1" };
    mocks.addComment.mockResolvedValue(comment);

    const res = await app.request("/tasks/1/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Great!", authorId: "user-1" }),
    });

    expect(res.status).toBe(201);
    expect(await json(res)).toEqual(comment);
    expect(mocks.addComment).toHaveBeenCalledWith(1, {
      body: "Great!",
      authorId: "user-1",
    });
  });

  it("returns 404 when task not found", async () => {
    mocks.addComment.mockResolvedValue(null);

    const res = await app.request("/tasks/999/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Text", authorId: "user-1" }),
    });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for empty body", async () => {
    const res = await app.request("/tasks/1/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "", authorId: "user-1" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for missing authorId", async () => {
    const res = await app.request("/tasks/1/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Text" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for invalid task id", async () => {
    const res = await app.request("/tasks/abc/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Text", authorId: "user-1" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("PATCH /tasks/:id/comments/:commentId", () => {
  it("updates comment body", async () => {
    const comment = { id: 1, body: "Updated" };
    mocks.updateComment.mockResolvedValue(comment);

    const res = await app.request("/tasks/1/comments/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Updated" }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(comment);
    expect(mocks.updateComment).toHaveBeenCalledWith(1, 1, { body: "Updated" });
  });

  it("returns 404 when comment not found", async () => {
    mocks.updateComment.mockResolvedValue(null);

    const res = await app.request("/tasks/1/comments/999", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "X" }),
    });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for invalid task id", async () => {
    const res = await app.request("/tasks/0/comments/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "X" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for invalid comment id", async () => {
    const res = await app.request("/tasks/1/comments/0", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "X" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for empty body", async () => {
    const res = await app.request("/tasks/1/comments/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("DELETE /tasks/:id/comments/:commentId", () => {
  it("deletes comment and returns success", async () => {
    mocks.deleteComment.mockResolvedValue(true);

    const res = await app.request("/tasks/1/comments/1", { method: "DELETE" });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ success: true });
    expect(mocks.deleteComment).toHaveBeenCalledWith(1, 1);
  });

  it("returns 404 when comment not found", async () => {
    mocks.deleteComment.mockResolvedValue(false);

    const res = await app.request("/tasks/1/comments/999", { method: "DELETE" });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for invalid ids", async () => {
    const res = await app.request("/tasks/abc/comments/1", { method: "DELETE" });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
