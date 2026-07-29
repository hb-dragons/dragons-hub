import { Worker, type Job } from "bullmq";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../config/database";
import { env } from "../config/env";
import { logger } from "../config/logger";
import {
  boardColumns,
  boards,
  tasks,
  taskAssignees,
} from "@dragons/db/schema";
import { publishDomainEvent } from "../services/events/event-publisher";
import { CLUB_TIME_ZONE, EVENT_TYPES, todayInClubZone } from "@dragons/shared";

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
  //
  // Club-local, matching loadDayOfCandidates and the stored dueDate. A UTC
  // "today" is yesterday between club midnight and 01:00/02:00, which stops
  // the exclusion excluding today and produces exactly that double-send.
  const todayStr = todayInClubZone();
  return await getDb()
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

// The 08:00 send gate is club-local, not UTC — otherwise a task due today
// wouldn't surface until 08:00 UTC (09:00/10:00 local). The club *day* comes
// from todayInClubZone(); only the hour has no shared equivalent, so this is
// the one piece that stays here. `hourCycle: "h23"` keeps midnight as "00" —
// some ICU builds otherwise emit "24".
function clubHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: CLUB_TIME_ZONE,
      hourCycle: "h23",
      hour: "2-digit",
    }).format(now),
  );
}

async function loadDayOfCandidates(): Promise<TaskReminderRow[]> {
  const now = new Date();
  if (clubHour(now) < 8) return [];
  const todayStr = todayInClubZone(now);
  return await getDb()
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
  const rows = await getDb()
    .select({ userId: taskAssignees.userId })
    .from(taskAssignees)
    .where(eq(taskAssignees.taskId, taskId));
  return rows.map((r) => r.userId);
}

async function emitAndMark(task: TaskReminderRow, kind: "lead" | "day_of"): Promise<void> {
  const assigneeUserIds = await loadAssigneeIds(task.id);
  if (assigneeUserIds.length === 0) return;

  await getDb().transaction(async (tx) => {
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
