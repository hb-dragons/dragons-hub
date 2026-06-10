import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
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
} from "../../services/admin/task.service";
import { requirePermission } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import type { AppEnv } from "../../types";
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
  taskAssigneeParamSchema,
} from "@dragons/contracts";

const taskRoutes = new Hono<AppEnv>();
const boardView = requirePermission("board", "view");
const boardUpdate = requirePermission("board", "update");

// GET /admin/boards/:boardId/tasks - List tasks for a board
taskRoutes.get(
  "/boards/:boardId/tasks",
  boardView,
  validator("param", taskBoardIdParamSchema, validationHook),
  validator("query", taskListQuerySchema, validationHook),
  describeRoute({
    description: "List tasks for a board",
    tags: ["Tasks"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const { boardId } = c.req.valid("param");
    const filters = c.req.valid("query");
    const result = await listTasks(boardId, filters);
    return c.json(result);
  },
);

// POST /admin/boards/:boardId/tasks - Create task
taskRoutes.post(
  "/boards/:boardId/tasks",
  boardUpdate,
  validator("param", taskBoardIdParamSchema, validationHook),
  validator("json", taskCreateBodySchema, validationHook),
  describeRoute({
    description: "Create task",
    tags: ["Tasks"],
    responses: {
      201: { description: "Created" },
      404: { description: "Board or column not found" },
    },
  }),
  async (c) => {
    const { boardId } = c.req.valid("param");
    const body = c.req.valid("json");
    const callerId = c.get("user")?.id;
    /* istanbul ignore next: requirePermission middleware guarantees user is set */
    if (!callerId) {
      return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    }
    const result = await createTask(boardId, body, callerId);

    if (!result) {
      return c.json(
        { error: "Board or column not found", code: "NOT_FOUND" },
        404,
      );
    }

    return c.json(result, 201);
  },
);

// GET /admin/tasks/:id - Get task detail
taskRoutes.get(
  "/tasks/:id",
  boardView,
  validator("param", taskIdParamSchema, validationHook),
  describeRoute({
    description: "Get task detail",
    tags: ["Tasks"],
    responses: {
      200: { description: "Success" },
      404: { description: "Task not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const result = await getTaskDetail(id);

    if (!result) {
      return c.json({ error: "Task not found", code: "NOT_FOUND" }, 404);
    }

    return c.json(result);
  },
);

// PATCH /admin/tasks/:id - Update task
taskRoutes.patch(
  "/tasks/:id",
  boardUpdate,
  validator("param", taskIdParamSchema, validationHook),
  validator("json", taskUpdateBodySchema, validationHook),
  describeRoute({
    description: "Update task",
    tags: ["Tasks"],
    responses: {
      200: { description: "Success" },
      404: { description: "Task not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const callerId = c.get("user")?.id;
    /* istanbul ignore next: requirePermission middleware guarantees user is set */
    if (!callerId) {
      return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    }
    const result = await updateTask(id, body, callerId);

    if (!result) {
      return c.json({ error: "Task not found", code: "NOT_FOUND" }, 404);
    }

    return c.json(result);
  },
);

// PATCH /admin/tasks/:id/move - Move task to column/position
taskRoutes.patch(
  "/tasks/:id/move",
  boardUpdate,
  validator("param", taskIdParamSchema, validationHook),
  validator("json", taskMoveBodySchema, validationHook),
  describeRoute({
    description: "Move task to column and position",
    tags: ["Tasks"],
    responses: {
      200: { description: "Success" },
      404: { description: "Task or column not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await moveTask(id, body.columnId, body.position);

    if (!result) {
      return c.json(
        { error: "Task or column not found", code: "NOT_FOUND" },
        404,
      );
    }

    return c.json(result);
  },
);

// DELETE /admin/tasks/:id - Delete task
taskRoutes.delete(
  "/tasks/:id",
  boardUpdate,
  validator("param", taskIdParamSchema, validationHook),
  describeRoute({
    description: "Delete task",
    tags: ["Tasks"],
    responses: {
      200: { description: "Success" },
      404: { description: "Task not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const deleted = await deleteTask(id);

    if (!deleted) {
      return c.json({ error: "Task not found", code: "NOT_FOUND" }, 404);
    }

    return c.json({ success: true });
  },
);

// POST /admin/tasks/:id/checklist - Add checklist item
taskRoutes.post(
  "/tasks/:id/checklist",
  boardUpdate,
  validator("param", taskIdParamSchema, validationHook),
  validator("json", checklistItemCreateBodySchema, validationHook),
  describeRoute({
    description: "Add checklist item",
    tags: ["Tasks"],
    responses: {
      201: { description: "Created" },
      404: { description: "Task not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await addChecklistItem(id, body);

    if (!result) {
      return c.json({ error: "Task not found", code: "NOT_FOUND" }, 404);
    }

    return c.json(result, 201);
  },
);

// PATCH /admin/tasks/:id/checklist/:itemId - Update checklist item
taskRoutes.patch(
  "/tasks/:id/checklist/:itemId",
  boardUpdate,
  validator("param", taskChecklistItemParamSchema, validationHook),
  validator("json", checklistItemUpdateBodySchema, validationHook),
  describeRoute({
    description: "Update checklist item",
    tags: ["Tasks"],
    responses: {
      200: { description: "Success" },
      404: { description: "Checklist item not found" },
    },
  }),
  async (c) => {
    const { id, itemId } = c.req.valid("param");
    const body = c.req.valid("json");
    const callerId = c.get("user")?.id;
    /* istanbul ignore next: requirePermission middleware guarantees user is set */
    if (!callerId) {
      return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    }
    const result = await updateChecklistItem(id, itemId, body, callerId);

    if (!result) {
      return c.json(
        { error: "Checklist item not found", code: "NOT_FOUND" },
        404,
      );
    }

    return c.json(result);
  },
);

// DELETE /admin/tasks/:id/checklist/:itemId - Delete checklist item
taskRoutes.delete(
  "/tasks/:id/checklist/:itemId",
  boardUpdate,
  validator("param", taskChecklistItemParamSchema, validationHook),
  describeRoute({
    description: "Delete checklist item",
    tags: ["Tasks"],
    responses: {
      200: { description: "Success" },
      404: { description: "Checklist item not found" },
    },
  }),
  async (c) => {
    const { id, itemId } = c.req.valid("param");
    const deleted = await deleteChecklistItem(id, itemId);

    if (!deleted) {
      return c.json(
        { error: "Checklist item not found", code: "NOT_FOUND" },
        404,
      );
    }

    return c.json({ success: true });
  },
);

// POST /admin/tasks/:id/comments - Add comment
taskRoutes.post(
  "/tasks/:id/comments",
  boardUpdate,
  validator("param", taskIdParamSchema, validationHook),
  validator("json", commentCreateBodySchema, validationHook),
  describeRoute({
    description: "Add comment",
    tags: ["Tasks"],
    responses: {
      201: { description: "Created" },
      404: { description: "Task not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const callerId = c.get("user")?.id;
    /* istanbul ignore next: requirePermission middleware guarantees user is set */
    if (!callerId) {
      return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    }
    const result = await addComment(id, body, callerId);

    if (!result) {
      return c.json({ error: "Task not found", code: "NOT_FOUND" }, 404);
    }

    return c.json(result, 201);
  },
);

// PATCH /admin/tasks/:id/comments/:commentId - Edit comment
taskRoutes.patch(
  "/tasks/:id/comments/:commentId",
  boardUpdate,
  validator("param", taskCommentParamSchema, validationHook),
  validator("json", commentUpdateBodySchema, validationHook),
  describeRoute({
    description: "Edit comment",
    tags: ["Tasks"],
    responses: {
      200: { description: "Success" },
      404: { description: "Comment not found" },
    },
  }),
  async (c) => {
    const { id, commentId } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await updateComment(id, commentId, body);

    if (!result) {
      return c.json({ error: "Comment not found", code: "NOT_FOUND" }, 404);
    }

    return c.json(result);
  },
);

// DELETE /admin/tasks/:id/comments/:commentId - Delete comment
taskRoutes.delete(
  "/tasks/:id/comments/:commentId",
  boardUpdate,
  validator("param", taskCommentParamSchema, validationHook),
  describeRoute({
    description: "Delete comment",
    tags: ["Tasks"],
    responses: {
      200: { description: "Success" },
      404: { description: "Comment not found" },
    },
  }),
  async (c) => {
    const { id, commentId } = c.req.valid("param");
    const deleted = await deleteComment(id, commentId);

    if (!deleted) {
      return c.json({ error: "Comment not found", code: "NOT_FOUND" }, 404);
    }

    return c.json({ success: true });
  },
);

// PUT /tasks/:id/assignees/:userId — idempotent add
taskRoutes.put(
  "/tasks/:id/assignees/:userId",
  boardUpdate,
  validator("param", taskAssigneeParamSchema, validationHook),
  describeRoute({
    description: "Assign a user to a task (idempotent)",
    tags: ["Tasks"],
    responses: {
      200: { description: "Success" },
      404: { description: "Task or user not found" },
    },
  }),
  async (c) => {
    const { id, userId } = c.req.valid("param");
    const callerId = c.get("user")?.id;
    /* istanbul ignore next: requirePermission middleware guarantees user is set */
    if (!callerId) {
      return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    }
    const result = await addAssignee(id, userId, callerId);
    if (!result) {
      return c.json({ error: "Task or user not found", code: "NOT_FOUND" }, 404);
    }
    return c.json(result);
  },
);

// DELETE /tasks/:id/assignees/:userId
taskRoutes.delete(
  "/tasks/:id/assignees/:userId",
  boardUpdate,
  validator("param", taskAssigneeParamSchema, validationHook),
  describeRoute({
    description: "Remove a user from a task",
    tags: ["Tasks"],
    responses: {
      200: { description: "Success" },
      404: { description: "Assignee not found" },
    },
  }),
  async (c) => {
    const { id, userId } = c.req.valid("param");
    const callerId = c.get("user")?.id;
    if (!callerId) return c.json({ error: "Unauthorized" }, 401);
    const removed = await removeAssignee(id, userId, callerId);
    if (!removed) {
      return c.json({ error: "Assignee not found", code: "NOT_FOUND" }, 404);
    }
    return c.json({ success: true });
  },
);

export { taskRoutes };
