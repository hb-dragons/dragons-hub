import { Hono } from "hono";
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
import {
  boardIdParamSchema,
  boardCreateBodySchema,
  boardUpdateBodySchema,
  columnIdParamSchema,
  columnCreateBodySchema,
  columnUpdateBodySchema,
  columnReorderBodySchema,
} from "./board.schemas";

const boardRoutes = new Hono();

// GET /admin/boards - List all boards
boardRoutes.get("/boards", async (c) => {
  const result = await listBoards();
  return c.json(result);
});

// POST /admin/boards - Create board with default columns
boardRoutes.post("/boards", async (c) => {
  const body = boardCreateBodySchema.parse(await c.req.json());
  const result = await createBoard(body.name, body.description, body.createdBy);
  return c.json(result, 201);
});

// GET /admin/boards/:id - Get board with columns
boardRoutes.get("/boards/:id", async (c) => {
  const { id } = boardIdParamSchema.parse({ id: c.req.param("id") });
  const result = await getBoard(id);

  if (!result) {
    return c.json({ error: "Board not found", code: "NOT_FOUND" }, 404);
  }

  return c.json(result);
});

// PATCH /admin/boards/:id - Update board
boardRoutes.patch("/boards/:id", async (c) => {
  const { id } = boardIdParamSchema.parse({ id: c.req.param("id") });
  const body = boardUpdateBodySchema.parse(await c.req.json());
  const result = await updateBoard(id, body);

  if (!result) {
    return c.json({ error: "Board not found", code: "NOT_FOUND" }, 404);
  }

  return c.json(result);
});

// DELETE /admin/boards/:id - Delete board
boardRoutes.delete("/boards/:id", async (c) => {
  const { id } = boardIdParamSchema.parse({ id: c.req.param("id") });
  const deleted = await deleteBoard(id);

  if (!deleted) {
    return c.json({ error: "Board not found", code: "NOT_FOUND" }, 404);
  }

  return c.json({ success: true });
});

// POST /admin/boards/:id/columns - Add column
boardRoutes.post("/boards/:id/columns", async (c) => {
  const { id } = boardIdParamSchema.parse({ id: c.req.param("id") });
  const body = columnCreateBodySchema.parse(await c.req.json());
  const result = await addColumn(id, body);

  if (!result) {
    return c.json({ error: "Board not found", code: "NOT_FOUND" }, 404);
  }

  return c.json(result, 201);
});

// PATCH /admin/boards/:id/columns/reorder - Reorder columns
// NOTE: This must be defined before the /:colId route to avoid conflicts
boardRoutes.patch("/boards/:id/columns/reorder", async (c) => {
  const { id } = boardIdParamSchema.parse({ id: c.req.param("id") });
  const body = columnReorderBodySchema.parse(await c.req.json());
  await reorderColumns(id, body.columns);
  return c.json({ success: true });
});

// PATCH /admin/boards/:id/columns/:colId - Update column
boardRoutes.patch("/boards/:id/columns/:colId", async (c) => {
  const { id, colId } = columnIdParamSchema.parse({
    id: c.req.param("id"),
    colId: c.req.param("colId"),
  });
  const body = columnUpdateBodySchema.parse(await c.req.json());
  const result = await updateColumn(id, colId, body);

  if (!result) {
    return c.json({ error: "Column not found", code: "NOT_FOUND" }, 404);
  }

  return c.json(result);
});

// DELETE /admin/boards/:id/columns/:colId - Delete column
boardRoutes.delete("/boards/:id/columns/:colId", async (c) => {
  const { id, colId } = columnIdParamSchema.parse({
    id: c.req.param("id"),
    colId: c.req.param("colId"),
  });
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
});

export { boardRoutes };
