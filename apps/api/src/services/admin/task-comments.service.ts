import { db } from "../../config/database";
import { tasks, taskAssignees, taskComments } from "@dragons/db/schema";
import { eq, and } from "drizzle-orm";
import type { TaskComment } from "@dragons/shared";
import { EVENT_TYPES } from "@dragons/shared";
import { truncateForPreview } from "../notifications/templates/task";
import { emitTaskEvent, loadBoardAndActor } from "./task-shared";

export async function addComment(
  taskId: number,
  data: { body: string },
  callerId: string,
): Promise<TaskComment | null> {
  return await db.transaction(async (tx) => {
    const [task] = await tx
      .select({ id: tasks.id, boardId: tasks.boardId, title: tasks.title })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    if (!task) return null;

    const [comment] = await tx
      .insert(taskComments)
      .values({ taskId, authorId: callerId, body: data.body })
      .returning();

    const rows = await tx
      .select({ userId: taskAssignees.userId })
      .from(taskAssignees)
      .where(eq(taskAssignees.taskId, taskId));
    const recipients = rows
      .map((r) => r.userId)
      .filter((u) => u !== callerId);

    if (recipients.length > 0) {
      const ctx = await loadBoardAndActor(tx, task.boardId, callerId);
      if (ctx) {
        const preview = truncateForPreview(data.body);
        await emitTaskEvent({
          type: EVENT_TYPES.TASK_COMMENT_ADDED,
          taskId: task.id,
          boardId: task.boardId,
          title: task.title,
          boardName: ctx.boardName,
          actor: callerId,
          payloadExtras: {
            commentId: comment!.id,
            authorId: callerId,
            authorName: ctx.actorName,
            bodyPreview: preview,
            recipientUserIds: recipients,
          },
          tx,
        });
      }
    }

    return {
      id: comment!.id,
      authorId: comment!.authorId,
      body: comment!.body,
      createdAt: comment!.createdAt.toISOString(),
      updatedAt: comment!.updatedAt.toISOString(),
    };
  });
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
