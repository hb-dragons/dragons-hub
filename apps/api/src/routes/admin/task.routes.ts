import { Hono } from "hono";
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
} from "../../services/admin/task.service";
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

const taskRoutes = new Hono();

// GET /admin/boards/:boardId/tasks - List tasks for a board
taskRoutes.get("/boards/:boardId/tasks", async (c) => {
  const { boardId } = taskBoardIdParamSchema.parse({
    boardId: c.req.param("boardId"),
  });
  const filters = taskListQuerySchema.parse({
    columnId: c.req.query("columnId"),
    assigneeId: c.req.query("assigneeId"),
    priority: c.req.query("priority"),
  });
  const result = await listTasks(boardId, filters);
  return c.json(result);
});

// POST /admin/boards/:boardId/tasks - Create task
taskRoutes.post("/boards/:boardId/tasks", async (c) => {
  const { boardId } = taskBoardIdParamSchema.parse({
    boardId: c.req.param("boardId"),
  });
  const body = taskCreateBodySchema.parse(await c.req.json());
  const result = await createTask(boardId, body);

  if (!result) {
    return c.json(
      { error: "Board or column not found", code: "NOT_FOUND" },
      404,
    );
  }

  return c.json(result, 201);
});

// GET /admin/tasks/:id - Get task detail
taskRoutes.get("/tasks/:id", async (c) => {
  const { id } = taskIdParamSchema.parse({ id: c.req.param("id") });
  const result = await getTaskDetail(id);

  if (!result) {
    return c.json({ error: "Task not found", code: "NOT_FOUND" }, 404);
  }

  return c.json(result);
});

// PATCH /admin/tasks/:id - Update task
taskRoutes.patch("/tasks/:id", async (c) => {
  const { id } = taskIdParamSchema.parse({ id: c.req.param("id") });
  const body = taskUpdateBodySchema.parse(await c.req.json());
  const result = await updateTask(id, body);

  if (!result) {
    return c.json({ error: "Task not found", code: "NOT_FOUND" }, 404);
  }

  return c.json(result);
});

// PATCH /admin/tasks/:id/move - Move task to column/position
taskRoutes.patch("/tasks/:id/move", async (c) => {
  const { id } = taskIdParamSchema.parse({ id: c.req.param("id") });
  const body = taskMoveBodySchema.parse(await c.req.json());
  const result = await moveTask(id, body.columnId, body.position);

  if (!result) {
    return c.json(
      { error: "Task or column not found", code: "NOT_FOUND" },
      404,
    );
  }

  return c.json(result);
});

// DELETE /admin/tasks/:id - Delete task
taskRoutes.delete("/tasks/:id", async (c) => {
  const { id } = taskIdParamSchema.parse({ id: c.req.param("id") });
  const deleted = await deleteTask(id);

  if (!deleted) {
    return c.json({ error: "Task not found", code: "NOT_FOUND" }, 404);
  }

  return c.json({ success: true });
});

// POST /admin/tasks/:id/checklist - Add checklist item
taskRoutes.post("/tasks/:id/checklist", async (c) => {
  const { id } = taskIdParamSchema.parse({ id: c.req.param("id") });
  const body = checklistItemCreateBodySchema.parse(await c.req.json());
  const result = await addChecklistItem(id, body);

  if (!result) {
    return c.json({ error: "Task not found", code: "NOT_FOUND" }, 404);
  }

  return c.json(result, 201);
});

// PATCH /admin/tasks/:id/checklist/:itemId - Update checklist item
taskRoutes.patch("/tasks/:id/checklist/:itemId", async (c) => {
  const { id, itemId } = taskChecklistItemParamSchema.parse({
    id: c.req.param("id"),
    itemId: c.req.param("itemId"),
  });
  const body = checklistItemUpdateBodySchema.parse(await c.req.json());
  const result = await updateChecklistItem(id, itemId, body);

  if (!result) {
    return c.json(
      { error: "Checklist item not found", code: "NOT_FOUND" },
      404,
    );
  }

  return c.json(result);
});

// DELETE /admin/tasks/:id/checklist/:itemId - Delete checklist item
taskRoutes.delete("/tasks/:id/checklist/:itemId", async (c) => {
  const { id, itemId } = taskChecklistItemParamSchema.parse({
    id: c.req.param("id"),
    itemId: c.req.param("itemId"),
  });
  const deleted = await deleteChecklistItem(id, itemId);

  if (!deleted) {
    return c.json(
      { error: "Checklist item not found", code: "NOT_FOUND" },
      404,
    );
  }

  return c.json({ success: true });
});

// POST /admin/tasks/:id/comments - Add comment
taskRoutes.post("/tasks/:id/comments", async (c) => {
  const { id } = taskIdParamSchema.parse({ id: c.req.param("id") });
  const body = commentCreateBodySchema.parse(await c.req.json());
  const result = await addComment(id, body);

  if (!result) {
    return c.json({ error: "Task not found", code: "NOT_FOUND" }, 404);
  }

  return c.json(result, 201);
});

// PATCH /admin/tasks/:id/comments/:commentId - Edit comment
taskRoutes.patch("/tasks/:id/comments/:commentId", async (c) => {
  const { id, commentId } = taskCommentParamSchema.parse({
    id: c.req.param("id"),
    commentId: c.req.param("commentId"),
  });
  const body = commentUpdateBodySchema.parse(await c.req.json());
  const result = await updateComment(id, commentId, body);

  if (!result) {
    return c.json({ error: "Comment not found", code: "NOT_FOUND" }, 404);
  }

  return c.json(result);
});

// DELETE /admin/tasks/:id/comments/:commentId - Delete comment
taskRoutes.delete("/tasks/:id/comments/:commentId", async (c) => {
  const { id, commentId } = taskCommentParamSchema.parse({
    id: c.req.param("id"),
    commentId: c.req.param("commentId"),
  });
  const deleted = await deleteComment(id, commentId);

  if (!deleted) {
    return c.json({ error: "Comment not found", code: "NOT_FOUND" }, 404);
  }

  return c.json({ success: true });
});

export { taskRoutes };
