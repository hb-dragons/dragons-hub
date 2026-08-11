import { getDb } from "../../config/database";
import { tasks, taskChecklistItems } from "@dragons/db/schema";
import { eq, and, sql } from "drizzle-orm";
import type { ChecklistItem } from "@dragons/shared";

export async function addChecklistItem(
  taskId: number,
  data: { label: string; position?: number },
): Promise<ChecklistItem | null> {
  // One transaction, and the parent task row is locked FOR UPDATE before the
  // MAX(position) probe. `MAX(position) + 1` is a read-modify-write: two adds
  // to the same task that interleave between the probe and the insert both
  // read the same maximum and both write that position, so the list ends up
  // with two items claiming one slot and an arbitrary render order. Locking
  // the task serialises adds per task (and only per task — adds to different
  // tasks never contend) and the existence check comes free with the lock.
  const item = await getDb().transaction(async (tx) => {
    const [task] = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1)
      .for("update");

    if (!task) return null;

    let position = data.position;
    if (position === undefined) {
      const [maxPos] = await tx
        .select({
          maxPosition: sql<number>`COALESCE(MAX(${taskChecklistItems.position}), -1)`,
        })
        .from(taskChecklistItems)
        .where(eq(taskChecklistItems.taskId, taskId));
      position = (maxPos?.maxPosition ?? -1) + 1;
    }

    const [inserted] = await tx
      .insert(taskChecklistItems)
      .values({
        taskId,
        label: data.label,
        position,
      })
      .returning();

    return inserted ?? null;
  });

  if (!item) return null;

  return {
    id: item.id,
    label: item.label,
    isChecked: item.isChecked,
    checkedBy: item.checkedBy,
    checkedAt: item.checkedAt?.toISOString() ?? null,
    position: item.position,
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

  const [updated] = await getDb()
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
  const [deleted] = await getDb()
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
