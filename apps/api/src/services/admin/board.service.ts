import { db } from "../../config/database";
import { boards, boardColumns, tasks } from "@dragons/db/schema";
import { eq, asc, and, count } from "drizzle-orm";
import type { BoardSummary, BoardData } from "@dragons/shared";

const DEFAULT_COLUMNS = [
  { name: "To Do", position: 0, isDoneColumn: false },
  { name: "In Progress", position: 1, isDoneColumn: false },
  { name: "Done", position: 2, isDoneColumn: true },
];

export async function listBoards(): Promise<BoardSummary[]> {
  const rows = await db
    .select({
      id: boards.id,
      name: boards.name,
      description: boards.description,
      createdAt: boards.createdAt,
    })
    .from(boards)
    .orderBy(asc(boards.id));
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export async function createBoard(
  name: string,
  description?: string | null,
  createdBy?: string | null,
): Promise<BoardData> {
  const [board] = await db
    .insert(boards)
    .values({
      name,
      description: description ?? null,
      createdBy: createdBy ?? null,
    })
    .returning();

  const columns = await db
    .insert(boardColumns)
    .values(
      DEFAULT_COLUMNS.map((col) => ({
        boardId: board!.id,
        name: col.name,
        position: col.position,
        isDoneColumn: col.isDoneColumn,
      })),
    )
    .returning();

  return {
    id: board!.id,
    name: board!.name,
    description: board!.description,
    createdBy: board!.createdBy,
    createdAt: board!.createdAt.toISOString(),
    updatedAt: board!.updatedAt.toISOString(),
    columns: columns
      .sort((a, b) => a.position - b.position)
      .map((col) => ({
        id: col.id,
        name: col.name,
        position: col.position,
        color: col.color,
        isDoneColumn: col.isDoneColumn,
      })),
  };
}

export async function getBoard(id: number): Promise<BoardData | null> {
  const [board] = await db
    .select()
    .from(boards)
    .where(eq(boards.id, id))
    .limit(1);

  if (!board) return null;

  const columns = await db
    .select({
      id: boardColumns.id,
      name: boardColumns.name,
      position: boardColumns.position,
      color: boardColumns.color,
      isDoneColumn: boardColumns.isDoneColumn,
    })
    .from(boardColumns)
    .where(eq(boardColumns.boardId, id))
    .orderBy(asc(boardColumns.position));

  return {
    id: board.id,
    name: board.name,
    description: board.description,
    createdBy: board.createdBy,
    createdAt: board.createdAt.toISOString(),
    updatedAt: board.updatedAt.toISOString(),
    columns,
  };
}

export async function updateBoard(
  id: number,
  data: { name?: string; description?: string | null },
): Promise<BoardData | null> {
  const [updated] = await db
    .update(boards)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(boards.id, id))
    .returning();

  if (!updated) return null;

  const columns = await db
    .select({
      id: boardColumns.id,
      name: boardColumns.name,
      position: boardColumns.position,
      color: boardColumns.color,
      isDoneColumn: boardColumns.isDoneColumn,
    })
    .from(boardColumns)
    .where(eq(boardColumns.boardId, id))
    .orderBy(asc(boardColumns.position));

  return {
    id: updated.id,
    name: updated.name,
    description: updated.description,
    createdBy: updated.createdBy,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
    columns,
  };
}

export async function deleteBoard(id: number): Promise<boolean> {
  const [deleted] = await db
    .delete(boards)
    .where(eq(boards.id, id))
    .returning({ id: boards.id });

  return !!deleted;
}

export async function addColumn(
  boardId: number,
  data: { name: string; color?: string | null; isDoneColumn?: boolean },
): Promise<{
  id: number;
  name: string;
  position: number;
  color: string | null;
  isDoneColumn: boolean;
} | null> {
  // Check board exists
  const [board] = await db
    .select({ id: boards.id })
    .from(boards)
    .where(eq(boards.id, boardId))
    .limit(1);

  if (!board) return null;

  // Get max position for this board
  const existingColumns = await db
    .select({ position: boardColumns.position })
    .from(boardColumns)
    .where(eq(boardColumns.boardId, boardId))
    .orderBy(asc(boardColumns.position));

  const maxPosition =
    existingColumns.length > 0
      ? Math.max(...existingColumns.map((c) => c.position))
      : -1;

  const [column] = await db
    .insert(boardColumns)
    .values({
      boardId,
      name: data.name,
      position: maxPosition + 1,
      color: data.color ?? null,
      isDoneColumn: data.isDoneColumn ?? false,
    })
    .returning();

  return {
    id: column!.id,
    name: column!.name,
    position: column!.position,
    color: column!.color,
    isDoneColumn: column!.isDoneColumn,
  };
}

export async function updateColumn(
  boardId: number,
  colId: number,
  data: {
    name?: string;
    position?: number;
    color?: string | null;
    isDoneColumn?: boolean;
  },
): Promise<{
  id: number;
  name: string;
  position: number;
  color: string | null;
  isDoneColumn: boolean;
} | null> {
  const [updated] = await db
    .update(boardColumns)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(boardColumns.id, colId), eq(boardColumns.boardId, boardId)))
    .returning();

  if (!updated) return null;

  return {
    id: updated.id,
    name: updated.name,
    position: updated.position,
    color: updated.color,
    isDoneColumn: updated.isDoneColumn,
  };
}

export async function deleteColumn(
  boardId: number,
  colId: number,
): Promise<boolean> {
  // Check if column has tasks
  const [taskCount] = await db
    .select({ count: count() })
    .from(tasks)
    .where(eq(tasks.columnId, colId));

  if (taskCount && taskCount.count > 0) {
    return false;
  }

  const [deleted] = await db
    .delete(boardColumns)
    .where(and(eq(boardColumns.id, colId), eq(boardColumns.boardId, boardId)))
    .returning({ id: boardColumns.id });

  return !!deleted;
}

export async function reorderColumns(
  boardId: number,
  positions: { id: number; position: number }[],
): Promise<void> {
  for (const { id, position } of positions) {
    await db
      .update(boardColumns)
      .set({ position, updatedAt: new Date() })
      .where(
        and(eq(boardColumns.id, id), eq(boardColumns.boardId, boardId)),
      );
  }
}
