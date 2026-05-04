import { db } from "../../config/database";
import { tasks, taskChecklistItems } from "@dragons/db/schema";
import { eq, and, sql } from "drizzle-orm";
import type { ChecklistItem } from "@dragons/shared";

export async function addChecklistItem(
  taskId: number,
  data: { label: string; position?: number },
): Promise<ChecklistItem | null> {
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
