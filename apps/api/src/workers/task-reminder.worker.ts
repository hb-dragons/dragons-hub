import { Worker, type Job } from "bullmq";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../config/database";
import { env } from "../config/env";
import { logger } from "../config/logger";
import {
  boardColumns,
  boards,
  tasks,
  taskAssignees,
} from "@dragons/db/schema";
import { publishDomainEvent } from "../services/events/event-publisher";
import { EVENT_TYPES } from "@dragons/shared";

const log = logger.child({ service: "task-reminder-worker" });

interface TaskReminderRow {
  id: number;
  boardId: number;
  boardName: string;
  title: string;
  dueDate: string | null;
}

async function loadLeadCandidates(): Promise<TaskReminderRow[]> {
  const leadEnd = new Date(Date.now() + 24 * 60 * 60 * 1000);
  // Lead reminder = "Due tomorrow" — strictly after today. Today's tasks are
  // handled by loadDayOfCandidates, which renders "Due today" text. Without
  // this exclusion a task due today would match both queries and produce a
  // misleading "Due tomorrow" in-app message alongside the day-of one.
  const todayStr = new Date().toISOString().slice(0, 10);
  return await db
    .select({
      id: tasks.id,
      boardId: tasks.boardId,
      boardName: boards.name,
      title: tasks.title,
      dueDate: tasks.dueDate,
    })
    .from(tasks)
    .innerJoin(boardColumns, eq(tasks.columnId, boardColumns.id))
    .innerJoin(boards, eq(tasks.boardId, boards.id))
    .where(
      and(
        sql`${tasks.dueDate} IS NOT NULL`,
        sql`${tasks.dueDate}::timestamptz <= ${leadEnd}`,
        sql`${tasks.dueDate} > ${todayStr}`,
        isNull(tasks.leadReminderSentAt),
        eq(boardColumns.isDoneColumn, false),
      ),
    );
}

async function loadDayOfCandidates(): Promise<TaskReminderRow[]> {
  const now = new Date();
  if (now.getUTCHours() < 8) return [];
  const todayStr = now.toISOString().slice(0, 10);
  return await db
    .select({
      id: tasks.id,
      boardId: tasks.boardId,
      boardName: boards.name,
      title: tasks.title,
      dueDate: tasks.dueDate,
    })
    .from(tasks)
    .innerJoin(boardColumns, eq(tasks.columnId, boardColumns.id))
    .innerJoin(boards, eq(tasks.boardId, boards.id))
    .where(
      and(
        eq(tasks.dueDate, todayStr),
        isNull(tasks.dueReminderSentAt),
        eq(boardColumns.isDoneColumn, false),
      ),
    );
}

async function loadAssigneeIds(taskId: number): Promise<string[]> {
  const rows = await db
    .select({ userId: taskAssignees.userId })
    .from(taskAssignees)
    .where(eq(taskAssignees.taskId, taskId));
  return rows.map((r) => r.userId);
}

async function emitAndMark(task: TaskReminderRow, kind: "lead" | "day_of"): Promise<void> {
  const assigneeUserIds = await loadAssigneeIds(task.id);
  if (assigneeUserIds.length === 0) return;

  await db.transaction(async (tx) => {
    // publishDomainEvent inserts inside the tx; the outbox poller picks
    // up the row after commit — do not call enqueueDomainEvent here.
    await publishDomainEvent(
      {
        type: EVENT_TYPES.TASK_DUE_REMINDER,
        source: "sync",
        entityType: "task",
        entityId: task.id,
        entityName: task.title,
        deepLinkPath: `/admin/boards/${task.boardId}?task=${task.id}`,
        payload: {
          taskId: task.id,
          boardId: task.boardId,
          boardName: task.boardName,
          title: task.title,
          dueDate: task.dueDate ?? "",
          reminderKind: kind,
          assigneeUserIds,
        },
      },
      tx,
    );

    const updates =
      kind === "lead"
        ? { leadReminderSentAt: new Date() }
        : { dueReminderSentAt: new Date() };
    await tx.update(tasks).set(updates).where(eq(tasks.id, task.id));
  });
}

export async function runTaskReminderSweep(): Promise<{ lead: number; dayOf: number }> {
  let lead = 0;
  let dayOf = 0;

  const leadRows = await loadLeadCandidates();
  for (const row of leadRows) {
    try {
      await emitAndMark(row, "lead");
      lead++;
    } catch (err) {
      log.warn({ err, taskId: row.id }, "Failed to emit task.due.reminder (lead)");
    }
  }

  const dayOfRows = await loadDayOfCandidates();
  for (const row of dayOfRows) {
    try {
      await emitAndMark(row, "day_of");
      dayOf++;
    } catch (err) {
      log.warn({ err, taskId: row.id }, "Failed to emit task.due.reminder (day_of)");
    }
  }

  if (lead > 0 || dayOf > 0) {
    log.info({ lead, dayOf }, "Task reminder sweep emitted events");
  }

  return { lead, dayOf };
}

export const taskReminderWorker = new Worker(
  "task-reminders",
  async (_job: Job) => runTaskReminderSweep(),
  {
    prefix: "{bull}",
    connection: { url: env.REDIS_URL },
    concurrency: 1,
  },
);

/* v8 ignore next 3 */
taskReminderWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Task reminder sweep failed");
});
