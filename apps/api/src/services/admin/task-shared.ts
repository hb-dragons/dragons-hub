import { db } from "../../config/database";
import { taskAssignees, boards, user } from "@dragons/db/schema";
import { eq, asc, sql } from "drizzle-orm";
import type { TaskAssignee, EventType } from "@dragons/shared";
import { publishDomainEvent, type TransactionClient } from "../events/event-publisher";
import { logger } from "../../config/logger";

const log = logger.child({ service: "task.service" });

export interface TaskFilters {
  columnId?: number;
  assigneeId?: string;
  priority?: string;
}

export async function fetchAssignees(taskId: number): Promise<TaskAssignee[]> {
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

export async function fetchAssigneesBatch(
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

export async function loadBoardAndActor(
  tx: TransactionClient,
  boardId: number,
  actorId: string,
): Promise<{ boardName: string; actorName: string } | null> {
  const [b] = await tx.select({ name: boards.name }).from(boards).where(eq(boards.id, boardId)).limit(1);
  if (!b) return null;
  const [u] = await tx.select({ name: user.name }).from(user).where(eq(user.id, actorId)).limit(1);
  return { boardName: b.name, actorName: u?.name ?? actorId };
}

export async function emitTaskEvent(params: {
  type: EventType;
  taskId: number;
  boardId: number;
  title: string;
  boardName: string;
  actor: string;
  payloadExtras: Record<string, unknown>;
  tx: TransactionClient;
}): Promise<void> {
  try {
    await publishDomainEvent(
      {
        type: params.type,
        source: "manual",
        entityType: "task",
        entityId: params.taskId,
        entityName: params.title,
        deepLinkPath: `/admin/boards/${params.boardId}?task=${params.taskId}`,
        actor: params.actor,
        payload: {
          taskId: params.taskId,
          boardId: params.boardId,
          boardName: params.boardName,
          title: params.title,
          ...params.payloadExtras,
        },
      },
      params.tx,
    );
  } catch (err) {
    log.warn({ err, taskId: params.taskId, type: params.type }, "Failed to emit task event");
  }
}
