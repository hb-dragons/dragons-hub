import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
vi.mock("../../config/database", () => ({
  db: new Proxy({}, { get: (_t, p) => (dbHolder.ref as Record<string | symbol, unknown>)[p] }),
}));

import { userNotificationPreferences } from "@dragons/db/schema";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";
import {
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
} from "./user-preferences.service";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
});

afterAll(async () => {
  await closeTestDb(ctx);
});

async function makeUser(id: string) {
  await ctx.client.exec(
    `INSERT INTO "user" (id, name, email) VALUES ('${id}', '${id}', '${id}@t.local')
     ON CONFLICT (id) DO NOTHING`,
  );
}

describe("user-preferences.service", () => {
  it("returns defaults when no preference row exists", async () => {
    await makeUser("u1");
    const result = await getUserNotificationPreferences("u1");
    expect(result).toEqual({ mutedEventTypes: [], locale: "de" });
  });

  it("returns stored preferences when row exists", async () => {
    await makeUser("u1");
    await (ctx.db as typeof import("../../config/database").db)
      .insert(userNotificationPreferences)
      .values({ userId: "u1", locale: "en", mutedEventTypes: ["task.assigned"] });

    const result = await getUserNotificationPreferences("u1");
    expect(result).toEqual({ mutedEventTypes: ["task.assigned"], locale: "en" });
  });

  it("creates a row on first update", async () => {
    await makeUser("u1");
    await updateUserNotificationPreferences("u1", {
      mutedEventTypes: ["task.comment.added"],
      locale: "en",
    });
    const [row] = await (ctx.db as typeof import("../../config/database").db)
      .select()
      .from(userNotificationPreferences)
      .where(eq(userNotificationPreferences.userId, "u1"));
    expect(row?.mutedEventTypes).toEqual(["task.comment.added"]);
    expect(row?.locale).toBe("en");
  });

  it("preserves existing fields when PATCH omits them", async () => {
    await makeUser("u1");
    await updateUserNotificationPreferences("u1", { locale: "en", mutedEventTypes: [] });
    await updateUserNotificationPreferences("u1", { mutedEventTypes: ["task.assigned"] });

    const result = await getUserNotificationPreferences("u1");
    expect(result).toEqual({ mutedEventTypes: ["task.assigned"], locale: "en" });
  });

  it("rejects unknown event types in mutedEventTypes", async () => {
    await makeUser("u1");
    await expect(
      updateUserNotificationPreferences("u1", { mutedEventTypes: ["bogus.event"] }),
    ).rejects.toThrow(/unknown event type/i);
  });
});
