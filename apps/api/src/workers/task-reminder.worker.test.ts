import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
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
    const dueIn20h = new Date(Date.now() + 20 * 60 * 60 * 1000);
    const { taskId } = await setup({ dueDate: dueIn20h });

    await runTaskReminderSweep();

    const newDue = new Date(Date.now() + 10 * 60 * 60 * 1000);
    await (ctx.db as typeof import("../config/database").db)
      .update(tasks)
      .set({
        dueDate: newDue.toISOString().slice(0, 10),
        leadReminderSentAt: null,
        dueReminderSentAt: null,
      })
      .where(eq(tasks.id, taskId));

    await runTaskReminderSweep();

    const events = await (ctx.db as typeof import("../config/database").db)
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.entityId, taskId));
    expect(events).toHaveLength(2);
  });
});
