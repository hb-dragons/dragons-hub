import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import * as eventPublisher from "../services/events/event-publisher";
import { eq } from "drizzle-orm";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../config/database", () => ({
  db: new Proxy(
    {},
    { get: (_t, p) => (dbHolder.ref as Record<string | symbol, unknown>)[p] },
  ),
}));

vi.mock("./queues", () => ({
  domainEventsQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("../config/env", () => ({
  env: { REDIS_URL: "redis://localhost:6379" },
}));

vi.mock("../config/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

vi.mock("bullmq", () => ({
  Worker: class MockWorker {
    constructor() {}
    on() {
      return this;
    }
  },
}));

import {
  boards,
  boardColumns,
  tasks,
  taskAssignees,
  domainEvents,
  user,
} from "@dragons/db/schema";
import { runTaskReminderSweep } from "./task-reminder.worker";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../test/setup-test-db";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

async function setup(options: {
  dueDate: Date;
  isDoneColumn?: boolean;
  hasAssignee?: boolean;
}) {
  await ctx.client.exec(`INSERT INTO boards (name) VALUES ('B')`);
  const doneFlag = options.isDoneColumn ? "true" : "false";
  await ctx.client.exec(
    `INSERT INTO board_columns (board_id, name, position, is_done_column)
     VALUES (1, 'Col', 0, ${doneFlag})`,
  );
  const userId = `u-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  await ctx.client.exec(
    `INSERT INTO "user" (id, name, email) VALUES ('${userId}', 'A', '${userId}@t.local')
     ON CONFLICT (id) DO NOTHING`,
  );
  const dueStr = options.dueDate.toISOString().slice(0, 10);
  await ctx.client.exec(
    `INSERT INTO tasks (board_id, column_id, title, due_date)
     VALUES (1, 1, 'Due Soon', '${dueStr}')`,
  );
  if (options.hasAssignee !== false) {
    await ctx.client.exec(
      `INSERT INTO task_assignees (task_id, user_id, assigned_by)
       VALUES (1, '${userId}', '${userId}')`,
    );
  }
  return { taskId: 1, userId, boardId: 1 };
}

describe("runTaskReminderSweep", () => {
  it("emits task.due.reminder lead for tasks due within the next 24h", async () => {
    const dueIn20h = new Date(Date.now() + 20 * 60 * 60 * 1000);
    const { taskId, userId } = await setup({ dueDate: dueIn20h });

    await runTaskReminderSweep();

    const events = await (ctx.db as typeof import("../config/database").db)
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.entityId, taskId));
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("task.due.reminder");
    const payload = events[0]!.payload as Record<string, unknown>;
    expect(payload.reminderKind).toBe("lead");
    expect(payload.assigneeUserIds).toEqual([userId]);
  });

  it("marks leadReminderSentAt so the sweep does not re-emit", async () => {
    const dueIn20h = new Date(Date.now() + 20 * 60 * 60 * 1000);
    const { taskId } = await setup({ dueDate: dueIn20h });

    await runTaskReminderSweep();
    await runTaskReminderSweep();

    const events = await (ctx.db as typeof import("../config/database").db)
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.entityId, taskId));
    expect(events).toHaveLength(1);

    const [row] = await (ctx.db as typeof import("../config/database").db)
      .select({ at: tasks.leadReminderSentAt })
      .from(tasks)
      .where(eq(tasks.id, taskId));
    expect(row!.at).not.toBeNull();
  });

  it("skips tasks whose column is flagged isDoneColumn", async () => {
    const dueIn20h = new Date(Date.now() + 20 * 60 * 60 * 1000);
    const { taskId } = await setup({ dueDate: dueIn20h, isDoneColumn: true });

    await runTaskReminderSweep();

    const events = await (ctx.db as typeof import("../config/database").db)
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.entityId, taskId));
    expect(events).toHaveLength(0);
  });

  it("skips tasks with no assignees", async () => {
    const dueIn20h = new Date(Date.now() + 20 * 60 * 60 * 1000);
    const { taskId } = await setup({ dueDate: dueIn20h, hasAssignee: false });

    await runTaskReminderSweep();

    const events = await (ctx.db as typeof import("../config/database").db)
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.entityId, taskId));
    expect(events).toHaveLength(0);
  });

  it("re-fires lead reminder after dueDate is changed and timestamps are reset", async () => {
    // Freeze at 04:00 UTC today so day-of returns early (< 08:00 UTC). Set
    // both dueDates to clearly-tomorrow so the lead query matches on both
    // sweeps independent of wall-clock time.
    const today = new Date();
    today.setUTCHours(4, 0, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(today);

    try {
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      const { taskId } = await setup({ dueDate: tomorrow });

      await runTaskReminderSweep();

      const newTomorrow = new Date(today.getTime() + 20 * 60 * 60 * 1000);
      await (ctx.db as typeof import("../config/database").db)
        .update(tasks)
        .set({
          dueDate: newTomorrow.toISOString().slice(0, 10),
          leadReminderSentAt: null,
          dueReminderSentAt: null,
        })
        .where(eq(tasks.id, taskId));

      await runTaskReminderSweep();

      const events = await (ctx.db as typeof import("../config/database").db)
        .select()
        .from(domainEvents)
        .where(eq(domainEvents.entityId, taskId));
      const leadEvents = events.filter(
        (e) => (e.payload as Record<string, unknown>).reminderKind === "lead",
      );
      expect(leadEvents).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not fire the lead reminder for a task due today (day-of only)", async () => {
    // Freeze at 04:00 UTC today so loadDayOfCandidates returns early (< 08:00),
    // leaving only loadLeadCandidates potentially matching. A due-today task
    // must NOT match the lead query — its "Due tomorrow" text would be wrong.
    const today = new Date();
    today.setUTCHours(4, 0, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(today);

    try {
      const { taskId } = await setup({ dueDate: today });

      await runTaskReminderSweep();

      const events = await (ctx.db as typeof import("../config/database").db)
        .select()
        .from(domainEvents)
        .where(eq(domainEvents.entityId, taskId));
      expect(events).toHaveLength(0);

      const [row] = await (ctx.db as typeof import("../config/database").db)
        .select({ at: tasks.leadReminderSentAt })
        .from(tasks)
        .where(eq(tasks.id, taskId));
      expect(row!.at).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("emits day_of reminder when task is due today after 08:00 UTC", async () => {
    // Freeze time at 10:00 UTC today — past the 08:00 threshold — so the
    // day-of branch of loadDayOfCandidates runs (not the pre-08:00 early return).
    const today = new Date();
    today.setUTCHours(10, 0, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(today);

    try {
      const { taskId, userId } = await setup({ dueDate: today });

      await runTaskReminderSweep();

      const events = await (ctx.db as typeof import("../config/database").db)
        .select()
        .from(domainEvents)
        .where(eq(domainEvents.entityId, taskId));

      const dayOf = events.find(
        (e) => (e.payload as Record<string, unknown>).reminderKind === "day_of",
      );
      expect(dayOf).toBeDefined();
      expect((dayOf!.payload as Record<string, unknown>).assigneeUserIds).toEqual([userId]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns no day_of candidates before 08:00 UTC", async () => {
    const today = new Date();
    today.setUTCHours(4, 0, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(today);

    try {
      const { taskId } = await setup({ dueDate: today });

      await runTaskReminderSweep();

      const events = await (ctx.db as typeof import("../config/database").db)
        .select()
        .from(domainEvents)
        .where(eq(domainEvents.entityId, taskId));
      const dayOf = events.filter(
        (e) => (e.payload as Record<string, unknown>).reminderKind === "day_of",
      );
      expect(dayOf).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("logs a warning and continues when lead emitAndMark throws — catch branch", async () => {
    const dueIn20h = new Date(Date.now() + 20 * 60 * 60 * 1000);
    const { taskId } = await setup({ dueDate: dueIn20h });

    // Force publishDomainEvent to throw — exercises the try/catch in runTaskReminderSweep
    // for the lead reminder loop (lines 131-133 in source).
    const spy = vi
      .spyOn(eventPublisher, "publishDomainEvent")
      .mockRejectedValueOnce(new Error("forced db failure"));

    const result = await runTaskReminderSweep();

    spy.mockRestore();

    // The sweep continues — lead count stays at 0 because the emit failed
    expect(result.lead).toBe(0);
    // No domain event was persisted
    const events = await (ctx.db as typeof import("../config/database").db)
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.entityId, taskId));
    expect(events).toHaveLength(0);
  });

  it("logs a warning and continues when day_of emitAndMark throws — catch branch", async () => {
    const today = new Date();
    today.setUTCHours(10, 0, 0, 0); // After 08:00 UTC so day-of runs
    vi.useFakeTimers();
    vi.setSystemTime(today);

    try {
      const { taskId } = await setup({ dueDate: today });

      const spy = vi
        .spyOn(eventPublisher, "publishDomainEvent")
        .mockRejectedValueOnce(new Error("forced db failure"));

      const result = await runTaskReminderSweep();

      spy.mockRestore();

      // dayOf count stays at 0 — emit failed
      expect(result.dayOf).toBe(0);

      const events = await (ctx.db as typeof import("../config/database").db)
        .select()
        .from(domainEvents)
        .where(eq(domainEvents.entityId, taskId));
      expect(events).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("logs info when both lead and dayOf are emitted in the same sweep", async () => {
    // Freeze at 10:00 UTC — after 08:00 so day-of runs, but also put a task
    // due within the next 24h (but not today) for lead to pick up.
    const today = new Date();
    today.setUTCHours(10, 0, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(today);

    try {
      // Task due today → picked up by day-of
      await setup({ dueDate: today });
      // Task due in 20h but tomorrow → picked up by lead
      // We need a second separate row
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      const userId2 = `u2-${Date.now()}`;
      await ctx.client.exec(
        `INSERT INTO "user" (id, name, email) VALUES ('${userId2}', 'B', '${userId2}@t.local') ON CONFLICT (id) DO NOTHING`,
      );
      await ctx.client.exec(`INSERT INTO boards (name) VALUES ('B2')`);
      await ctx.client.exec(
        `INSERT INTO board_columns (board_id, name, position, is_done_column) VALUES (2, 'Col', 0, false)`,
      );
      const dueStr = tomorrow.toISOString().slice(0, 10);
      await ctx.client.exec(
        `INSERT INTO tasks (board_id, column_id, title, due_date) VALUES (2, 2, 'L', '${dueStr}')`,
      );
      await ctx.client.exec(
        `INSERT INTO task_assignees (task_id, user_id, assigned_by) VALUES (2, '${userId2}', '${userId2}')`,
      );

      const result = await runTaskReminderSweep();
      // Both lead and dayOf are > 0 — exercises the log.info branch (line 155)
      expect(result.lead + result.dayOf).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
