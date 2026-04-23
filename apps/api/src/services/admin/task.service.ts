import { db } from "../../config/database";
import {
  tasks,
  taskChecklistItems,
  taskComments,
  boardColumns,
  boards,
  taskAssignees,
  user,
} from "@dragons/db/schema";
import { eq, and, asc, sql, count } from "drizzle-orm";
import type {
  TaskCardData,
  TaskDetail,
  ChecklistItem,
  TaskComment,
  TaskPriority,
  TaskAssignee,
} from "@dragons/shared";

export interface TaskFilters {
  columnId?: number;
  assigneeId?: string;
  priority?: string;
}

// --- Private helpers ---

async function fetchAssignees(taskId: number): Promise<TaskAssignee[]> {
  const rows = await db
    .select({
      userId: taskAssignees.userId,
      name: user.name,
      assignedAt: taskAssignees.assignedAt,
    })
    .from(taskAssignees)
    .innerJoin(user, eq(user.id, taskAssignees.userId))
    .where(eq(taskAssignees.taskId, taskId))
    .orderBy(asc(taskAssignees.assignedAt));
  return rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    assignedAt: r.assignedAt.toISOString(),
  }));
}

async function fetchAssigneesBatch(
  taskIds: number[],
): Promise<Map<number, TaskAssignee[]>> {
  if (taskIds.length === 0) return new Map();
  const rows = await db
    .select({
      taskId: taskAssignees.taskId,
      userId: taskAssignees.userId,
      name: user.name,
      assignedAt: taskAssignees.assignedAt,
    })
    .from(taskAssignees)
    .innerJoin(user, eq(user.id, taskAssignees.userId))
    .where(
      sql`${taskAssignees.taskId} IN (${sql.join(taskIds.map((id) => sql`${id}`), sql`, `)})`,
    )
    .orderBy(asc(taskAssignees.assignedAt));
  const map = new Map<number, TaskAssignee[]>();
  for (const r of rows) {
    const list = map.get(r.taskId) ?? [];
    list.push({
      userId: r.userId,
      name: r.name,
      assignedAt: r.assignedAt.toISOString(),
    });
    map.set(r.taskId, list);
  }
  return map;
}

export async function listTasks(
  boardId: number,
  filters?: TaskFilters,
): Promise<TaskCardData[]> {
  // Build where conditions
  const conditions = [eq(tasks.boardId, boardId)];
  if (filters?.columnId) {
    conditions.push(eq(tasks.columnId, filters.columnId));
  }
  if (filters?.assigneeId) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM ${taskAssignees} ta
                  WHERE ta.task_id = ${tasks.id}
                    AND ta.user_id = ${filters.assigneeId})`,
    );
  }
  if (filters?.priority) {
    conditions.push(eq(tasks.priority, filters.priority as TaskPriority));
  }

  const rows = await db
    .select({
      id: tasks.id,
      boardId: tasks.boardId,
      columnId: tasks.columnId,
      title: tasks.title,
      description: tasks.description,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      position: tasks.position,
    })
    .from(tasks)
    .where(and(...conditions))
    .orderBy(asc(tasks.position), asc(tasks.id));

  // Get checklist counts for all tasks in one query
  const taskIds = rows.map((r) => r.id);
  if (taskIds.length === 0) return [];

  const checklistCounts = await db
    .select({
      taskId: taskChecklistItems.taskId,
      total: count(),
      checked: sql<number>`count(*) filter (where ${taskChecklistItems.isChecked} = true)`,
    })
    .from(taskChecklistItems)
    .where(
      sql`${taskChecklistItems.taskId} IN (${sql.join(
        taskIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    )
    .groupBy(taskChecklistItems.taskId);

  const countMap = new Map(
    checklistCounts.map((c) => [c.taskId, { total: c.total, checked: c.checked }]),
  );

  const assigneesMap = await fetchAssigneesBatch(taskIds);

  return rows.map((row) => ({
    ...row,
    priority: row.priority as TaskPriority,
    checklistTotal: countMap.get(row.id)?.total ?? 0,
    checklistChecked: countMap.get(row.id)?.checked ?? 0,
    assignees: assigneesMap.get(row.id) ?? [],
  }));
}

export async function createTask(
  boardId: number,
  data: {
    title: string;
    description?: string | null;
    assigneeIds?: string[];
    priority?: string;
    dueDate?: string | null;
    columnId: number;
  },
  callerId: string,
): Promise<TaskDetail | null> {
  const created = await db.transaction(async (tx) => {
    const [board] = await tx
      .select({ id: boards.id })
      .from(boards)
      .where(eq(boards.id, boardId))
      .limit(1);
    if (!board) return null;

    const [column] = await tx
      .select({ id: boardColumns.id })
      .from(boardColumns)
      .where(
        and(
          eq(boardColumns.id, data.columnId),
          eq(boardColumns.boardId, boardId),
        ),
      )
      .limit(1);
    if (!column) return null;

    // Lock target column's tasks to serialize concurrent appends.
    await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.columnId, data.columnId))
      .for("update");

    const [maxPos] = await tx
      .select({ maxPosition: sql<number>`COALESCE(MAX(${tasks.position}), -1)` })
      .from(tasks)
      .where(eq(tasks.columnId, data.columnId));

    const [task] = await tx
      .insert(tasks)
      .values({
        boardId,
        columnId: data.columnId,
        title: data.title,
        description: data.description ?? null,
        priority: (data.priority ?? "normal") as TaskPriority,
        dueDate: data.dueDate ?? null,
        position: (maxPos?.maxPosition ?? -1) + 1,
        createdBy: callerId,
      })
      .returning();

    if (data.assigneeIds && data.assigneeIds.length > 0) {
      const uniq = [...new Set(data.assigneeIds)];
      await tx
        .insert(taskAssignees)
        .values(uniq.map((uid) => ({
          taskId: task!.id,
          userId: uid,
          assignedBy: callerId,
        })))
        .onConflictDoNothing();
    }

    return task!;
  });

  if (!created) return null;

  const assignees = await fetchAssignees(created.id);

  return {
    id: created.id,
    boardId: created.boardId,
    columnId: created.columnId,
    title: created.title,
    description: created.description,
    assignees,
    priority: created.priority as TaskPriority,
    dueDate: created.dueDate,
    position: created.position,
    checklistTotal: 0,
    checklistChecked: 0,
    createdBy: created.createdBy,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
    checklist: [],
    comments: [],
  };
}

export async function getTaskDetail(id: number): Promise<TaskDetail | null> {
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, id))
    .limit(1);

  if (!task) return null;

  const checklist = await db
    .select({
      id: taskChecklistItems.id,
      label: taskChecklistItems.label,
      isChecked: taskChecklistItems.isChecked,
      checkedBy: taskChecklistItems.checkedBy,
      checkedAt: taskChecklistItems.checkedAt,
      position: taskChecklistItems.position,
    })
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.taskId, id))
    .orderBy(asc(taskChecklistItems.position));

  const comments = await db
    .select({
      id: taskComments.id,
      authorId: taskComments.authorId,
      body: taskComments.body,
      createdAt: taskComments.createdAt,
      updatedAt: taskComments.updatedAt,
    })
    .from(taskComments)
    .where(eq(taskComments.taskId, id))
    .orderBy(asc(taskComments.createdAt));

  const assignees = await fetchAssignees(id);

  return {
    id: task.id,
    boardId: task.boardId,
    columnId: task.columnId,
    title: task.title,
    description: task.description,
    assignees,
    priority: task.priority as TaskPriority,
    dueDate: task.dueDate,
    position: task.position,
    checklistTotal: checklist.length,
    checklistChecked: checklist.filter((c) => c.isChecked).length,
    createdBy: task.createdBy,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    checklist: checklist.map((c) => ({
      ...c,
      checkedAt: c.checkedAt?.toISOString() ?? null,
    })),
    comments: comments.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
  };
}

export async function updateTask(
  id: number,
  data: {
    title?: string;
    description?: string | null;
    assigneeIds?: string[];
    priority?: string;
    dueDate?: string | null;
  },
  callerId: string,
): Promise<TaskDetail | null> {
  const setData: Record<string, unknown> = { updatedAt: new Date() };
  if (data.title !== undefined) setData.title = data.title;
  if (data.description !== undefined) setData.description = data.description;
  if (data.priority !== undefined) setData.priority = data.priority;
  if (data.dueDate !== undefined) setData.dueDate = data.dueDate;

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(tasks)
      .set(setData)
      .where(eq(tasks.id, id))
      .returning();

    if (!row) return null;

    if (data.assigneeIds !== undefined) {
      const uniq = [...new Set(data.assigneeIds)];
      await tx.delete(taskAssignees).where(eq(taskAssignees.taskId, id));
      if (uniq.length > 0) {
        await tx.insert(taskAssignees).values(
          uniq.map((uid) => ({ taskId: id, userId: uid, assignedBy: callerId })),
        );
      }
    }

    return row;
  });

  if (!updated) return null;

  return getTaskDetail(id);
}

export async function moveTask(
  id: number,
  targetColumnId: number,
  targetPosition: number,
): Promise<TaskDetail | null> {
  const result = await db.transaction(async (tx) => {
    const [task] = await tx
      .select()
      .from(tasks)
      .where(eq(tasks.id, id))
      .for("update");
    if (!task) return null;

    const [column] = await tx
      .select({ id: boardColumns.id })
      .from(boardColumns)
      .where(eq(boardColumns.id, targetColumnId))
      .limit(1);
    if (!column) return null;

    const fromColumnId = task.columnId;
    const fromPosition = task.position;

    // Lock rows in source and target columns to serialize concurrent moves.
    await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        sql`${tasks.columnId} IN (${fromColumnId}, ${targetColumnId})`,
      )
      .for("update");

    // Count target-column siblings excluding the moving task.
    const [targetCount] = await tx
      .select({ c: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.columnId, targetColumnId),
          sql`${tasks.id} <> ${id}`,
        ),
      );
    const maxAllowed = targetCount?.c ?? 0;
    const clamped = Math.max(0, Math.min(targetPosition, maxAllowed));

    if (fromColumnId === targetColumnId) {
      if (clamped === fromPosition) {
        // No-op reorder.
        return task.id;
      }
      if (clamped < fromPosition) {
        // Moving up: shift rows in [clamped, fromPosition) down by +1.
        await tx
          .update(tasks)
          .set({ position: sql`${tasks.position} + 1` })
          .where(
            and(
              eq(tasks.columnId, targetColumnId),
              sql`${tasks.position} >= ${clamped}`,
              sql`${tasks.position} < ${fromPosition}`,
              sql`${tasks.id} <> ${id}`,
            ),
          );
      } else {
        // Moving down: shift rows in (fromPosition, clamped] up by -1.
        await tx
          .update(tasks)
          .set({ position: sql`${tasks.position} - 1` })
          .where(
            and(
              eq(tasks.columnId, targetColumnId),
              sql`${tasks.position} > ${fromPosition}`,
              sql`${tasks.position} <= ${clamped}`,
              sql`${tasks.id} <> ${id}`,
            ),
          );
      }
      await tx
        .update(tasks)
        .set({ position: clamped, updatedAt: new Date() })
        .where(eq(tasks.id, id));
    } else {
      // Close the gap in the source column.
      await tx
        .update(tasks)
        .set({ position: sql`${tasks.position} - 1` })
        .where(
          and(
            eq(tasks.columnId, fromColumnId),
            sql`${tasks.position} > ${fromPosition}`,
          ),
        );
      // Open a slot in the target column.
      await tx
        .update(tasks)
        .set({ position: sql`${tasks.position} + 1` })
        .where(
          and(
            eq(tasks.columnId, targetColumnId),
            sql`${tasks.position} >= ${clamped}`,
          ),
        );
      await tx
        .update(tasks)
        .set({ columnId: targetColumnId, position: clamped, updatedAt: new Date() })
        .where(eq(tasks.id, id));
    }

    return task.id;
  });

  if (result === null) return null;
  return getTaskDetail(result);
}

export async function deleteTask(id: number): Promise<boolean> {
  const [deleted] = await db
    .delete(tasks)
    .where(eq(tasks.id, id))
    .returning({ id: tasks.id });

  return !!deleted;
}

// --- Assignees ---

export async function addAssignee(
  taskId: number,
  userId: string,
  callerId: string,
): Promise<TaskAssignee | null> {
  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!task) return null;

  const [u] = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!u) return null;

  await db
    .insert(taskAssignees)
    .values({ taskId, userId, assignedBy: callerId })
    .onConflictDoNothing();

  const [row] = await db
    .select({
      userId: taskAssignees.userId,
      assignedAt: taskAssignees.assignedAt,
    })
    .from(taskAssignees)
    .where(
      and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, userId)),
    );
  return row
    ? { userId, name: u.name, assignedAt: row.assignedAt.toISOString() }
    : null;
}

export async function removeAssignee(
  taskId: number,
  userId: string,
): Promise<boolean> {
  const result = await db
    .delete(taskAssignees)
    .where(
      and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, userId)),
    )
    .returning({ taskId: taskAssignees.taskId });
  return result.length > 0;
}

// --- Checklist Items ---

export async function addChecklistItem(
  taskId: number,
  data: { label: string; position?: number },
): Promise<ChecklistItem | null> {
  // Verify task exists
  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!task) return null;

  let position = data.position;
  if (position === undefined) {
    const [maxPos] = await db
      .select({
        maxPosition: sql<number>`COALESCE(MAX(${taskChecklistItems.position}), -1)`,
      })
      .from(taskChecklistItems)
      .where(eq(taskChecklistItems.taskId, taskId));
    position = (maxPos?.maxPosition ?? -1) + 1;
  }

  const [item] = await db
    .insert(taskChecklistItems)
    .values({
      taskId,
      label: data.label,
      position,
    })
    .returning();

  return {
    id: item!.id,
    label: item!.label,
    isChecked: item!.isChecked,
    checkedBy: item!.checkedBy,
    checkedAt: item!.checkedAt?.toISOString() ?? null,
    position: item!.position,
  };
}

export async function updateChecklistItem(
  taskId: number,
  itemId: number,
  data: { label?: string; isChecked?: boolean },
  callerId: string,
): Promise<ChecklistItem | null> {
  const updateData: Record<string, unknown> = {};
  if (data.label !== undefined) updateData.label = data.label;
  if (data.isChecked !== undefined) {
    updateData.isChecked = data.isChecked;
    if (data.isChecked) {
      updateData.checkedAt = new Date();
      updateData.checkedBy = callerId;
    } else {
      updateData.checkedAt = null;
      updateData.checkedBy = null;
    }
  }

  const [updated] = await db
    .update(taskChecklistItems)
    .set(updateData)
    .where(
      and(
        eq(taskChecklistItems.id, itemId),
        eq(taskChecklistItems.taskId, taskId),
      ),
    )
    .returning();

  if (!updated) return null;

  return {
    id: updated.id,
    label: updated.label,
    isChecked: updated.isChecked,
    checkedBy: updated.checkedBy,
    checkedAt: updated.checkedAt?.toISOString() ?? null,
    position: updated.position,
  };
}

export async function deleteChecklistItem(
  taskId: number,
  itemId: number,
): Promise<boolean> {
  const [deleted] = await db
    .delete(taskChecklistItems)
    .where(
      and(
        eq(taskChecklistItems.id, itemId),
        eq(taskChecklistItems.taskId, taskId),
      ),
    )
    .returning({ id: taskChecklistItems.id });

  return !!deleted;
}

// --- Comments ---

export async function addComment(
  taskId: number,
  data: { body: string },
  callerId: string,
): Promise<TaskComment | null> {
  // Verify task exists
  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!task) return null;

  const [comment] = await db
    .insert(taskComments)
    .values({
      taskId,
      authorId: callerId,
      body: data.body,
    })
    .returning();

  return {
    id: comment!.id,
    authorId: comment!.authorId,
    body: comment!.body,
    createdAt: comment!.createdAt.toISOString(),
    updatedAt: comment!.updatedAt.toISOString(),
  };
}

export async function updateComment(
  taskId: number,
  commentId: number,
  data: { body: string },
): Promise<TaskComment | null> {
  const [updated] = await db
    .update(taskComments)
    .set({ body: data.body, updatedAt: new Date() })
    .where(
      and(
        eq(taskComments.id, commentId),
        eq(taskComments.taskId, taskId),
      ),
    )
    .returning();

  if (!updated) return null;

  return {
    id: updated.id,
    authorId: updated.authorId,
    body: updated.body,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  };
}

export async function deleteComment(
  taskId: number,
  commentId: number,
): Promise<boolean> {
  const [deleted] = await db
    .delete(taskComments)
    .where(
      and(
        eq(taskComments.id, commentId),
        eq(taskComments.taskId, taskId),
      ),
    )
    .returning({ id: taskComments.id });

  return !!deleted;
}
