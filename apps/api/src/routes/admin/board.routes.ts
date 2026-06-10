import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
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
} from "../../services/admin/board.service";
import { requirePermission } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import type { AppEnv } from "../../types";
import {
  boardIdParamSchema,
  boardCreateBodySchema,
  boardUpdateBodySchema,
  columnIdParamSchema,
  columnCreateBodySchema,
  columnUpdateBodySchema,
  columnReorderBodySchema,
} from "@dragons/contracts";

const boardRoutes = new Hono<AppEnv>();
const boardView = requirePermission("board", "view");
const boardUpdate = requirePermission("board", "update");
const boardDelete = requirePermission("board", "delete");

// GET /admin/boards - List all boards
boardRoutes.get(
  "/boards",
  boardView,
  describeRoute({
    description: "List all boards",
    tags: ["Boards"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const result = await listBoards();
    return c.json(result);
  },
);

// POST /admin/boards - Create board with default columns
boardRoutes.post(
  "/boards",
  boardUpdate,
  validator("json", boardCreateBodySchema, validationHook),
  describeRoute({
    description: "Create board with default columns",
    tags: ["Boards"],
    responses: { 201: { description: "Created" } },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const result = await createBoard(body.name, body.description, body.createdBy);
    return c.json(result, 201);
  },
);

// GET /admin/boards/:id - Get board with columns
boardRoutes.get(
  "/boards/:id",
  boardView,
  validator("param", boardIdParamSchema, validationHook),
  describeRoute({
    description: "Get board with columns",
    tags: ["Boards"],
    responses: {
      200: { description: "Success" },
      404: { description: "Board not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const result = await getBoard(id);

    if (!result) {
      return c.json({ error: "Board not found", code: "NOT_FOUND" }, 404);
    }

    return c.json(result);
  },
);

// PATCH /admin/boards/:id - Update board
boardRoutes.patch(
  "/boards/:id",
  boardUpdate,
  validator("param", boardIdParamSchema, validationHook),
  validator("json", boardUpdateBodySchema, validationHook),
  describeRoute({
    description: "Update board",
    tags: ["Boards"],
    responses: {
      200: { description: "Success" },
      404: { description: "Board not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await updateBoard(id, body);

    if (!result) {
      return c.json({ error: "Board not found", code: "NOT_FOUND" }, 404);
    }

    return c.json(result);
  },
);

// DELETE /admin/boards/:id - Delete board
boardRoutes.delete(
  "/boards/:id",
  boardDelete,
  validator("param", boardIdParamSchema, validationHook),
  describeRoute({
    description: "Delete board",
    tags: ["Boards"],
    responses: {
      200: { description: "Success" },
      404: { description: "Board not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const deleted = await deleteBoard(id);

    if (!deleted) {
      return c.json({ error: "Board not found", code: "NOT_FOUND" }, 404);
    }

    return c.json({ success: true });
  },
);

// POST /admin/boards/:id/columns - Add column
boardRoutes.post(
  "/boards/:id/columns",
  boardUpdate,
  validator("param", boardIdParamSchema, validationHook),
  validator("json", columnCreateBodySchema, validationHook),
  describeRoute({
    description: "Add column to board",
    tags: ["Boards"],
    responses: {
      201: { description: "Created" },
      404: { description: "Board not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await addColumn(id, body);

    if (!result) {
      return c.json({ error: "Board not found", code: "NOT_FOUND" }, 404);
    }

    return c.json(result, 201);
  },
);

// PATCH /admin/boards/:id/columns/reorder - Reorder columns
// NOTE: This must be defined before the /:colId route to avoid conflicts
boardRoutes.patch(
  "/boards/:id/columns/reorder",
  boardUpdate,
  validator("param", boardIdParamSchema, validationHook),
  validator("json", columnReorderBodySchema, validationHook),
  describeRoute({
    description: "Reorder board columns",
    tags: ["Boards"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const { columns } = c.req.valid("json");
    await reorderColumns(id, columns);
    return c.json({ success: true });
  },
);

// PATCH /admin/boards/:id/columns/:colId - Update column
boardRoutes.patch(
  "/boards/:id/columns/:colId",
  boardUpdate,
  validator("param", columnIdParamSchema, validationHook),
  validator("json", columnUpdateBodySchema, validationHook),
  describeRoute({
    description: "Update column",
    tags: ["Boards"],
    responses: {
      200: { description: "Success" },
      404: { description: "Column not found" },
    },
  }),
  async (c) => {
    const { id, colId } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await updateColumn(id, colId, body);

    if (!result) {
      return c.json({ error: "Column not found", code: "NOT_FOUND" }, 404);
    }

    return c.json(result);
  },
);

// DELETE /admin/boards/:id/columns/:colId - Delete column
boardRoutes.delete(
  "/boards/:id/columns/:colId",
  boardUpdate,
  validator("param", columnIdParamSchema, validationHook),
  describeRoute({
    description: "Delete column",
    tags: ["Boards"],
    responses: {
      200: { description: "Success" },
      404: { description: "Column not found or has tasks" },
    },
  }),
  async (c) => {
    const { id, colId } = c.req.valid("param");
    const deleted = await deleteColumn(id, colId);

    if (!deleted) {
      return c.json(
        {
          error: "Column not found or has tasks",
          code: "NOT_FOUND",
        },
        404,
      );
    }

    return c.json({ success: true });
  },
);

export { boardRoutes };
