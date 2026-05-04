import { db } from "../../config/database";
import {
  tasks,
  taskChecklistItems,
  taskComments,
  boardColumns,
  boards,
  taskAssignees,
} from "@dragons/db/schema";
import { eq, and, asc, sql, count } from "drizzle-orm";
import type {
  TaskCardData,
  TaskDetail,
  TaskPriority,
} from "@dragons/shared";
import { EVENT_TYPES } from "@dragons/shared";
import {
  emitTaskEvent,
  fetchAssignees,
  fetchAssigneesBatch,
  loadBoardAndActor,
  type TaskFilters,
} from "./task-shared";

export async function listTasks(
  boardId: number,
  filters?: TaskFilters,
): Promise<TaskCardData[]> {
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

      const ctx = await loadBoardAndActor(tx, boardId, callerId);
      if (ctx) {
        await emitTaskEvent({
          type: EVENT_TYPES.TASK_ASSIGNED,
          taskId: task!.id,
          boardId: task!.boardId,
          title: task!.title,
          boardName: ctx.boardName,
          actor: callerId,
          payloadExtras: {
            assigneeUserIds: uniq,
            assignedBy: ctx.actorName,
            dueDate: task!.dueDate,
            priority: task!.priority ?? "normal",
          },
          tx,
        });
      }
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
  if (data.dueDate !== undefined) {
    setData.dueDate = data.dueDate;
    setData.leadReminderSentAt = null;
    setData.dueReminderSentAt = null;
  }

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(tasks)
      .set(setData)
      .where(eq(tasks.id, id))
      .returning();

    if (!row) return null;

    if (data.assigneeIds !== undefined) {
      const nextIds = new Set([...new Set(data.assigneeIds)]);
      const existing = await tx
        .select({ userId: taskAssignees.userId })
        .from(taskAssignees)
        .where(eq(taskAssignees.taskId, id));
      const existingIds = new Set(existing.map((r) => r.userId));
      const added: string[] = [];
      const removed: string[] = [];
      for (const uid of nextIds) if (!existingIds.has(uid)) added.push(uid);
      for (const uid of existingIds) if (!nextIds.has(uid)) removed.push(uid);

      await tx.delete(taskAssignees).where(eq(taskAssignees.taskId, id));
      if (nextIds.size > 0) {
        await tx.insert(taskAssignees).values(
          [...nextIds].map((uid) => ({ taskId: id, userId: uid, assignedBy: callerId })),
        );
      }

      if (added.length > 0 || removed.length > 0) {
        const ctx = await loadBoardAndActor(tx, row.boardId, callerId);
        if (ctx) {
          if (removed.length > 0) {
            await emitTaskEvent({
              type: EVENT_TYPES.TASK_UNASSIGNED,
              taskId: row.id,
              boardId: row.boardId,
              title: row.title,
              boardName: ctx.boardName,
              actor: callerId,
              payloadExtras: { unassignedUserIds: removed, unassignedBy: ctx.actorName },
              tx,
            });
          }
          if (added.length > 0) {
            await emitTaskEvent({
              type: EVENT_TYPES.TASK_ASSIGNED,
              taskId: row.id,
              boardId: row.boardId,
              title: row.title,
              boardName: ctx.boardName,
              actor: callerId,
              payloadExtras: {
                assigneeUserIds: added,
                assignedBy: ctx.actorName,
                dueDate: row.dueDate,
                priority: row.priority ?? "normal",
              },
              tx,
            });
          }
        }
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

    await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        sql`${tasks.columnId} IN (${fromColumnId}, ${targetColumnId})`,
      )
      .for("update");

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
        return task.id;
      }
      if (clamped < fromPosition) {
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
      await tx
        .update(tasks)
        .set({ position: sql`${tasks.position} - 1` })
        .where(
          and(
            eq(tasks.columnId, fromColumnId),
            sql`${tasks.position} > ${fromPosition}`,
          ),
        );
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
