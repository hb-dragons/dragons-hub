import { db } from "../../config/database";
import { tasks, taskAssignees, user } from "@dragons/db/schema";
import { eq, and } from "drizzle-orm";
import type { TaskAssignee } from "@dragons/shared";
import { EVENT_TYPES } from "@dragons/shared";
import { emitTaskEvent, loadBoardAndActor } from "./task-shared";

export async function addAssignee(
  taskId: number,
  userId: string,
  callerId: string,
): Promise<TaskAssignee | null> {
  return await db.transaction(async (tx) => {
    const [task] = await tx
      .select({ id: tasks.id, boardId: tasks.boardId, title: tasks.title, dueDate: tasks.dueDate, priority: tasks.priority })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    if (!task) return null;

    const [u] = await tx
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!u) return null;

    const insertResult = await tx
      .insert(taskAssignees)
      .values({ taskId, userId, assignedBy: callerId })
      .onConflictDoNothing()
      .returning({ userId: taskAssignees.userId });
    const created = insertResult.length > 0;

    const [row] = await tx
      .select({ userId: taskAssignees.userId, assignedAt: taskAssignees.assignedAt })
      .from(taskAssignees)
      .where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, userId)));

    if (created) {
      const ctx = await loadBoardAndActor(tx, task.boardId, callerId);
      if (ctx) {
        await emitTaskEvent({
          type: EVENT_TYPES.TASK_ASSIGNED,
          taskId: task.id,
          boardId: task.boardId,
          title: task.title,
          boardName: ctx.boardName,
          actor: callerId,
          payloadExtras: {
            assigneeUserIds: [userId],
            assignedBy: ctx.actorName,
            dueDate: task.dueDate,
            priority: task.priority ?? "normal",
          },
          tx,
        });
      }
    }

    return row ? { userId, name: u.name, assignedAt: row.assignedAt.toISOString() } : null;
  });
}

export async function removeAssignee(
  taskId: number,
  userId: string,
  callerId: string,
): Promise<boolean> {
  return await db.transaction(async (tx) => {
    const [task] = await tx
      .select({ id: tasks.id, boardId: tasks.boardId, title: tasks.title, dueDate: tasks.dueDate, priority: tasks.priority })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    if (!task) return false;

    const deleted = await tx
      .delete(taskAssignees)
      .where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, userId)))
      .returning({ taskId: taskAssignees.taskId });

    if (deleted.length === 0) return false;

    const ctx = await loadBoardAndActor(tx, task.boardId, callerId);
    if (ctx) {
      await emitTaskEvent({
        type: EVENT_TYPES.TASK_UNASSIGNED,
        taskId: task.id,
        boardId: task.boardId,
        title: task.title,
        boardName: ctx.boardName,
        actor: callerId,
        payloadExtras: { unassignedUserIds: [userId], unassignedBy: ctx.actorName },
        tx,
      });
    }
    return true;
  });
}
