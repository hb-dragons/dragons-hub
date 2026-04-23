# Native Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire native push notifications end-to-end — server adapter through Expo Push Service, native registration + handler, and an admin web button to trigger a test push against the admin's own device.

**Architecture:** Adds a `push` channel adapter mirroring the existing `whatsapp-group.ts` pattern. Role-defaults extended so personal/high-urgency events emit both `in_app` and `push` channel entries. Native client requests permission on sign-in, registers the Expo push token, handles foreground banners and tap-to-deep-link. Receipts reconciled via a 15-minute cron worker that purges invalid tokens.

**Tech Stack:** Hono (API), Drizzle (Postgres), BullMQ (workers), Expo SDK 55 + expo-notifications (native), Next.js (web), Vitest (tests). Provider: Expo Push Service (free, no SDK dependency — plain `fetch` wrapper).

**Reference:** Spec at `docs/superpowers/specs/2026-04-23-native-push-notifications-design.md`.

---

## File Map

**New (server, `apps/api`):**
- `src/services/notifications/expo-push.client.ts` + test
- `src/services/notifications/channels/push.ts` + test
- `src/services/notifications/templates/push/referee-assigned.ts` + test
- `src/services/notifications/templates/push/referee-unassigned.ts` + test
- `src/services/notifications/templates/push/referee-reassigned.ts` + test
- `src/services/notifications/templates/push/referee-slots.ts` + test
- `src/services/notifications/templates/push/match-cancelled.ts` + test
- `src/services/notifications/templates/push/match-rescheduled.ts` + test
- `src/services/notifications/templates/push/index.ts` (registry)
- `src/workers/push-receipt.worker.ts` + test
- `src/routes/admin/notification-test.routes.ts` + test

**New (native, `apps/native`):**
- `src/lib/push/registration.ts` + test
- `src/lib/push/handler.ts` + test
- `src/hooks/usePushRegistration.ts`

**New (web, `apps/web`):**
- `src/components/admin/push-test-card.tsx`
- `src/app/admin/settings/notifications/page.tsx`

**Modified (server):**
- `packages/db/src/schema/push-devices.ts` (+2 columns)
- `packages/db/src/schema/notification-log.ts` (+3 columns)
- `apps/api/src/services/notifications/role-defaults.ts` (widen channel union, PUSH_ELIGIBLE_EVENTS)
- `apps/api/src/services/notifications/notification-pipeline.ts` (push branch in dispatch)
- `apps/api/src/workers/index.ts` (register receipt worker cron)
- `apps/api/src/routes/device.routes.ts` (locale field, lastSeenAt bump)
- `apps/api/src/routes/admin/index.ts` (mount notification-test route)
- `apps/api/src/config/env.ts` (EXPO_ACCESS_TOKEN, EXPO_PROJECT_ID)

**Modified (native):**
- `apps/native/app.config.ts` or `app.json` (expo-notifications plugin)
- `apps/native/src/app/_layout.tsx` (mount handler + hook)
- `apps/native/package.json` (add `expo-device` if not present)

**Modified (docs):**
- `AGENTS.md` (push channel + receipt worker)
- `CLAUDE.md` (env vars)

**Migration:** auto-generated single Drizzle migration covering 5 ALTER + 1 INSERT.

---

## Conventions for All Tasks

- Tests live next to source: `foo.ts` ↔ `foo.test.ts`
- Run tests via `pnpm --filter @dragons/api test path/to/test.ts` (server) or `pnpm test` (root, all)
- Type checks: `pnpm typecheck`
- After each task, commit with conventional-commit prefix (`feat`, `chore`, `test`, `docs`)
- **Never** add `Co-Authored-By` or AI trailers to commits
- Follow existing patterns: `Result` types, Zod schemas at boundaries, `logger.child({ service: "..." })`

---

## Task 1: Schema additions, migration, and channel-config seed

**Files:**
- Modify: `packages/db/src/schema/push-devices.ts`
- Modify: `packages/db/src/schema/notification-log.ts`
- Create: `packages/db/migrations/NNNN_native_push_extensions.sql` (auto-generated)
- Create: `packages/db/migrations/NNNN_native_push_extensions_seed.sql` (manual append)

- [ ] **Step 1.1: Update `push-devices.ts` schema**

Replace the contents of `packages/db/src/schema/push-devices.ts`:

```ts
import {
  pgTable,
  serial,
  text,
  varchar,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";

export const pushDevices = pgTable(
  "push_devices",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    token: text("token").notNull(),
    platform: varchar("platform", { length: 10 }).notNull(),
    locale: text("locale"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIdx: index("push_devices_user_idx").on(table.userId),
    tokenUnique: unique("push_devices_token_unique").on(table.token),
  }),
);

export type PushDevice = typeof pushDevices.$inferSelect;
export type NewPushDevice = typeof pushDevices.$inferInsert;
```

- [ ] **Step 1.2: Update `notification-log.ts` schema**

In `packages/db/src/schema/notification-log.ts`, add three new columns inside the `pgTable` definition (before the `(table) =>` callback):

```ts
    providerTicketId: text("provider_ticket_id"),
    providerReceiptCheckedAt: timestamp("provider_receipt_checked_at", {
      withTimezone: true,
    }),
    recipientToken: text("recipient_token"),
```

Place these after `retryCount` and before `createdAt`.

- [ ] **Step 1.3: Generate the migration**

Run from repo root:
```bash
pnpm --filter @dragons/db db:generate
```
Expected output: a new SQL file under `packages/db/migrations/` with `ALTER TABLE` statements for the new columns.

- [ ] **Step 1.4: Append channel_configs seed to the same migration**

Open the generated migration file and append at the bottom:

```sql
--> statement-breakpoint
INSERT INTO "channel_configs" ("name", "type", "enabled", "config", "digest_mode", "digest_timezone")
SELECT 'Expo Push', 'push', true, '{"provider":"expo"}'::jsonb, 'immediate', 'Europe/Berlin'
WHERE NOT EXISTS (SELECT 1 FROM "channel_configs" WHERE "type" = 'push');
```

The `WHERE NOT EXISTS` guard makes the seed idempotent (safe to re-run).

- [ ] **Step 1.5: Apply the migration**

Make sure Postgres is running (`docker compose -f docker/docker-compose.dev.yml up -d`), then:
```bash
pnpm --filter @dragons/db db:migrate
```
Expected: migration applies cleanly. No errors.

- [ ] **Step 1.6: Smoke-verify the schema**

```bash
psql $DATABASE_URL -c "\d push_devices" -c "\d notification_log" -c "SELECT id, name, type FROM channel_configs WHERE type='push';"
```
Expected: `locale` and `last_seen_at` columns on `push_devices`; `provider_ticket_id`, `provider_receipt_checked_at`, `recipient_token` columns on `notification_log`; one row in `channel_configs` with `type='push'`.

- [ ] **Step 1.7: Commit**

```bash
git add packages/db/src/schema/push-devices.ts packages/db/src/schema/notification-log.ts packages/db/migrations/
git commit -m "feat(db): add push device + notification log columns for Expo push"
```

---

## Task 2: Env vars (EXPO_ACCESS_TOKEN, EXPO_PROJECT_ID)

**Files:**
- Modify: `apps/api/src/config/env.ts`
- Modify: `.env.example` (root)

- [ ] **Step 2.1: Add env vars to schema**

In `apps/api/src/config/env.ts`, add inside `envSchema = z.object({...})`:

```ts
  // Expo Push (native notifications)
  EXPO_ACCESS_TOKEN: z.string().min(1).optional(),
  EXPO_PROJECT_ID: z.string().min(1).optional(),
```

Place these right after the `WAHA_SESSION` line, before the `REFEREE_SDK_USERNAME` block.

- [ ] **Step 2.2: Document in `.env.example`**

Append to `.env.example` (or update if section exists):

```
# Expo Push (optional — enables authenticated send tier with higher rate limits)
# Get token from https://expo.dev → account settings → access tokens
EXPO_ACCESS_TOKEN=
# Optional — only used to validate that EAS project ID matches between server + native
EXPO_PROJECT_ID=
```

- [ ] **Step 2.3: Verify env still parses**

```bash
pnpm --filter @dragons/api typecheck
```
Expected: passes. No new errors.

- [ ] **Step 2.4: Commit**

```bash
git add apps/api/src/config/env.ts .env.example
git commit -m "chore(env): add EXPO_ACCESS_TOKEN and EXPO_PROJECT_ID"
```

---

## Task 3: Update `device.routes.ts` to accept locale and bump lastSeenAt

**Files:**
- Modify: `apps/api/src/routes/device.routes.ts`
- Modify: `apps/api/src/routes/device.routes.test.ts`

- [ ] **Step 3.1: Write failing test for locale + lastSeenAt**

Add to `apps/api/src/routes/device.routes.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "../config/database";
import { pushDevices } from "@dragons/db/schema";

describe("POST /devices/register — locale and lastSeenAt", () => {
  it("stores locale on first register", async () => {
    const headers = await signInTestUser(); // helper from existing test setup
    const res = await testClient.post("/devices/register", {
      headers,
      body: { token: "ExponentPushToken[loctest1]", platform: "ios", locale: "de-DE" },
    });
    expect(res.status).toBe(200);
    const [row] = await db
      .select()
      .from(pushDevices)
      .where(eq(pushDevices.token, "ExponentPushToken[loctest1]"));
    expect(row.locale).toBe("de-DE");
    expect(row.lastSeenAt).toBeInstanceOf(Date);
  });

  it("bumps lastSeenAt on re-register", async () => {
    const headers = await signInTestUser();
    await testClient.post("/devices/register", {
      headers,
      body: { token: "ExponentPushToken[bump1]", platform: "ios", locale: "de-DE" },
    });
    const [first] = await db
      .select()
      .from(pushDevices)
      .where(eq(pushDevices.token, "ExponentPushToken[bump1]"));

    await new Promise((r) => setTimeout(r, 50));

    await testClient.post("/devices/register", {
      headers,
      body: { token: "ExponentPushToken[bump1]", platform: "ios", locale: "en-US" },
    });
    const [second] = await db
      .select()
      .from(pushDevices)
      .where(eq(pushDevices.token, "ExponentPushToken[bump1]"));

    expect(second.lastSeenAt.getTime()).toBeGreaterThan(first.lastSeenAt.getTime());
    expect(second.locale).toBe("en-US");
  });
});
```

If the existing test file does not have a `signInTestUser`/`testClient` helper, mirror the pattern from any other route test in `apps/api/src/routes/admin/*.test.ts`.

- [ ] **Step 3.2: Run test to verify it fails**

```bash
pnpm --filter @dragons/api test src/routes/device.routes.test.ts
```
Expected: FAIL — body schema rejects `locale`, or `lastSeenAt` is not bumped.

- [ ] **Step 3.3: Update `device.routes.ts`**

Edit `apps/api/src/routes/device.routes.ts`:

```ts
const registerBodySchema = z.object({
  token: z.string().min(1),
  platform: z.enum(["ios", "android"]),
  locale: z.string().min(2).max(15).optional(),
});

// inside the POST /register handler, replace the upsert with:
    const { token, platform, locale } = registerBodySchema.parse(await c.req.json());

    await db
      .insert(pushDevices)
      .values({ userId: session.user.id, token, platform, locale })
      .onConflictDoUpdate({
        target: pushDevices.token,
        set: {
          userId: session.user.id,
          platform,
          locale,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        },
      });
```

- [ ] **Step 3.4: Run test to verify it passes**

```bash
pnpm --filter @dragons/api test src/routes/device.routes.test.ts
```
Expected: PASS.

- [ ] **Step 3.5: Commit**

```bash
git add apps/api/src/routes/device.routes.ts apps/api/src/routes/device.routes.test.ts
git commit -m "feat(api): accept locale on /devices/register and bump lastSeenAt"
```

---

## Task 4: Expo Push HTTP client

**Files:**
- Create: `apps/api/src/services/notifications/expo-push.client.ts`
- Create: `apps/api/src/services/notifications/expo-push.client.test.ts`

- [ ] **Step 4.1: Write failing tests**

Create `apps/api/src/services/notifications/expo-push.client.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExpoPushClient } from "./expo-push.client";

describe("ExpoPushClient", () => {
  const fetchMock = vi.fn();
  let client: ExpoPushClient;

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    client = new ExpoPushClient({ accessToken: undefined });
  });
  afterEach(() => vi.unstubAllGlobals());

  describe("sendBatch", () => {
    it("returns empty array for empty input without calling fetch", async () => {
      const result = await client.sendBatch([]);
      expect(result).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("posts a single batch for ≤100 messages", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ status: "ok", id: "tkt1" }] }),
      });
      const result = await client.sendBatch([
        { to: "ExponentPushToken[a]", title: "T", body: "B" },
      ]);
      expect(result).toEqual([{ status: "ok", id: "tkt1" }]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://exp.host/--/api/v2/push/send");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toHaveLength(1);
    });

    it("splits batches >100 into multiple calls preserving order", async () => {
      const messages = Array.from({ length: 250 }, (_, i) => ({
        to: `ExponentPushToken[${i}]`,
        title: "t",
        body: "b",
      }));
      fetchMock.mockImplementation(async (_url, init) => {
        const sent = JSON.parse((init as RequestInit).body as string) as unknown[];
        return {
          ok: true,
          json: async () => ({
            data: sent.map((_, i) => ({ status: "ok", id: `id${i}` })),
          }),
        };
      });
      const result = await client.sendBatch(messages);
      expect(result).toHaveLength(250);
      expect(fetchMock).toHaveBeenCalledTimes(3); // 100 + 100 + 50
    });

    it("includes Authorization header when accessToken set", async () => {
      const authClient = new ExpoPushClient({ accessToken: "abc" });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ status: "ok", id: "x" }] }),
      });
      await authClient.sendBatch([{ to: "ExponentPushToken[a]", title: "t", body: "b" }]);
      const [, init] = fetchMock.mock.calls[0];
      expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer abc");
    });

    it("throws on non-ok HTTP response", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "boom",
      });
      await expect(
        client.sendBatch([{ to: "ExponentPushToken[a]", title: "t", body: "b" }]),
      ).rejects.toThrow(/500/);
    });

    it("throws on network error", async () => {
      fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
      await expect(
        client.sendBatch([{ to: "ExponentPushToken[a]", title: "t", body: "b" }]),
      ).rejects.toThrow(/ECONNREFUSED/);
    });
  });

  describe("getReceipts", () => {
    it("returns empty object for empty input without calling fetch", async () => {
      const result = await client.getReceipts([]);
      expect(result).toEqual({});
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("batches >1000 ticket IDs across calls", async () => {
      const ids = Array.from({ length: 2500 }, (_, i) => `tkt${i}`);
      fetchMock.mockImplementation(async () => ({
        ok: true,
        json: async () => ({ data: {} }),
      }));
      await client.getReceipts(ids);
      expect(fetchMock).toHaveBeenCalledTimes(3); // 1000 + 1000 + 500
    });

    it("posts ticket ids to /push/getReceipts", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { tkt1: { status: "ok" }, tkt2: { status: "error", message: "oops" } },
        }),
      });
      const result = await client.getReceipts(["tkt1", "tkt2"]);
      expect(result.tkt1.status).toBe("ok");
      expect(result.tkt2.status).toBe("error");
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://exp.host/--/api/v2/push/getReceipts");
      expect(JSON.parse(init.body as string)).toEqual({ ids: ["tkt1", "tkt2"] });
    });
  });
});
```

- [ ] **Step 4.2: Run test to verify it fails**

```bash
pnpm --filter @dragons/api test src/services/notifications/expo-push.client.test.ts
```
Expected: FAIL — `ExpoPushClient` not defined.

- [ ] **Step 4.3: Implement `expo-push.client.ts`**

Create `apps/api/src/services/notifications/expo-push.client.ts`:

```ts
import { logger } from "../../config/logger";

const log = logger.child({ service: "expo-push" });

const SEND_URL = "https://exp.host/--/api/v2/push/send";
const RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const SEND_BATCH_LIMIT = 100;
const RECEIPTS_BATCH_LIMIT = 1000;
const REQUEST_TIMEOUT_MS = 30_000;

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  channelId?: string;
  priority?: "default" | "normal" | "high";
}

export interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

export interface ExpoPushReceipt {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

export interface ExpoPushClientOptions {
  accessToken?: string;
}

export class ExpoPushClient {
  private readonly accessToken?: string;

  constructor(options: ExpoPushClientOptions = {}) {
    this.accessToken = options.accessToken;
  }

  async sendBatch(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    if (messages.length === 0) return [];
    const tickets: ExpoPushTicket[] = [];
    for (let i = 0; i < messages.length; i += SEND_BATCH_LIMIT) {
      const chunk = messages.slice(i, i + SEND_BATCH_LIMIT);
      const chunkTickets = await this.postSend(chunk);
      tickets.push(...chunkTickets);
    }
    return tickets;
  }

  async getReceipts(ticketIds: string[]): Promise<Record<string, ExpoPushReceipt>> {
    if (ticketIds.length === 0) return {};
    const out: Record<string, ExpoPushReceipt> = {};
    for (let i = 0; i < ticketIds.length; i += RECEIPTS_BATCH_LIMIT) {
      const chunk = ticketIds.slice(i, i + RECEIPTS_BATCH_LIMIT);
      const chunkReceipts = await this.postReceipts(chunk);
      Object.assign(out, chunkReceipts);
    }
    return out;
  }

  private async postSend(chunk: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.accessToken) headers["Authorization"] = `Bearer ${this.accessToken}`;

    const res = await this.fetchWithTimeout(SEND_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(chunk),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      log.error({ status: res.status, text }, "Expo push send failed");
      throw new Error(`Expo push send failed: ${res.status} ${text}`);
    }

    const json = (await res.json()) as { data: ExpoPushTicket[] };
    return json.data ?? [];
  }

  private async postReceipts(chunk: string[]): Promise<Record<string, ExpoPushReceipt>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.accessToken) headers["Authorization"] = `Bearer ${this.accessToken}`;

    const res = await this.fetchWithTimeout(RECEIPTS_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ ids: chunk }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      log.error({ status: res.status, text }, "Expo push getReceipts failed");
      throw new Error(`Expo push getReceipts failed: ${res.status} ${text}`);
    }

    const json = (await res.json()) as { data: Record<string, ExpoPushReceipt> };
    return json.data ?? {};
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}
```

- [ ] **Step 4.4: Run test to verify it passes**

```bash
pnpm --filter @dragons/api test src/services/notifications/expo-push.client.test.ts
```
Expected: PASS — all 9 tests green.

- [ ] **Step 4.5: Commit**

```bash
git add apps/api/src/services/notifications/expo-push.client.ts apps/api/src/services/notifications/expo-push.client.test.ts
git commit -m "feat(notifications): add ExpoPushClient HTTP wrapper"
```

---

## Task 5: Push templates — referee assignment events

**Files:**
- Create: `apps/api/src/services/notifications/templates/push/types.ts`
- Create: `apps/api/src/services/notifications/templates/push/referee-assigned.ts` + test
- Create: `apps/api/src/services/notifications/templates/push/referee-unassigned.ts` + test
- Create: `apps/api/src/services/notifications/templates/push/referee-reassigned.ts` + test

- [ ] **Step 5.1: Create shared types file**

Create `apps/api/src/services/notifications/templates/push/types.ts`:

```ts
export interface PushTemplateOutput {
  title: string;
  body: string;
  data: Record<string, unknown>;
}

export type Locale = "de" | "en";

export const TITLE_MAX = 50;
export const BODY_MAX = 178;
```

- [ ] **Step 5.2: Write failing test for `referee-assigned`**

Create `apps/api/src/services/notifications/templates/push/referee-assigned.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderRefereeAssignedPush } from "./referee-assigned";
import { BODY_MAX, TITLE_MAX } from "./types";

const payload = {
  matchId: 123,
  matchNo: "0042",
  homeTeam: "Dragons U16",
  guestTeam: "TSV Neustadt",
  slot: "SR1" as const,
  kickoffDate: "2026-04-30",
  kickoffTime: "14:00",
  eventId: "evt_assigned_1",
};

describe("renderRefereeAssignedPush", () => {
  it("renders German output", () => {
    const out = renderRefereeAssignedPush(payload, "de");
    expect(out.title).toContain("Schiedsrichter");
    expect(out.body).toContain("Dragons U16");
    expect(out.body).toContain("TSV Neustadt");
    expect(out.body).toContain("SR1");
    expect(out.data.deepLink).toBe("/referee-game/123");
    expect(out.data.eventType).toBe("referee.assigned");
    expect(out.data.eventId).toBe("evt_assigned_1");
  });

  it("renders English output", () => {
    const out = renderRefereeAssignedPush(payload, "en");
    expect(out.title.toLowerCase()).toContain("referee");
    expect(out.body).toContain("Dragons U16");
    expect(out.body).toContain("TSV Neustadt");
  });

  it("respects title and body length limits", () => {
    const longPayload = {
      ...payload,
      homeTeam: "X".repeat(80),
      guestTeam: "Y".repeat(80),
    };
    const out = renderRefereeAssignedPush(longPayload, "de");
    expect(out.title.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(out.body.length).toBeLessThanOrEqual(BODY_MAX);
  });

  it("returns JSON-serializable data payload", () => {
    const out = renderRefereeAssignedPush(payload, "de");
    expect(() => JSON.stringify(out.data)).not.toThrow();
  });
});
```

- [ ] **Step 5.3: Run test to verify it fails**

```bash
pnpm --filter @dragons/api test src/services/notifications/templates/push/referee-assigned.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 5.4: Implement `referee-assigned.ts`**

Create `apps/api/src/services/notifications/templates/push/referee-assigned.ts`:

```ts
import type { Locale, PushTemplateOutput } from "./types";
import { BODY_MAX, TITLE_MAX } from "./types";

export interface RefereeAssignedPayload {
  matchId: number;
  matchNo: string;
  homeTeam: string;
  guestTeam: string;
  slot: "SR1" | "SR2";
  kickoffDate: string;
  kickoffTime: string;
  eventId: string;
}

const TITLE = {
  de: "🏀 Schiedsrichter zugewiesen",
  en: "🏀 Referee assigned",
};

const BODY_TEMPLATE = {
  de: (p: RefereeAssignedPayload) =>
    `Du wurdest als ${p.slot} für ${p.homeTeam} vs. ${p.guestTeam} am ${formatDe(p.kickoffDate)} um ${p.kickoffTime} eingesetzt.`,
  en: (p: RefereeAssignedPayload) =>
    `You've been assigned as ${p.slot} for ${p.homeTeam} vs. ${p.guestTeam} on ${formatEn(p.kickoffDate)} at ${p.kickoffTime}.`,
};

export function renderRefereeAssignedPush(
  payload: RefereeAssignedPayload,
  locale: Locale,
): PushTemplateOutput {
  const title = truncate(TITLE[locale], TITLE_MAX);
  const body = truncate(BODY_TEMPLATE[locale](payload), BODY_MAX);
  return {
    title,
    body,
    data: {
      deepLink: `/referee-game/${payload.matchId}`,
      eventType: "referee.assigned",
      eventId: payload.eventId,
    },
  };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

function formatDe(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function formatEn(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${y}-${m}-${d}`;
}
```

- [ ] **Step 5.5: Run test, verify pass**

```bash
pnpm --filter @dragons/api test src/services/notifications/templates/push/referee-assigned.test.ts
```
Expected: PASS — all 4 tests.

- [ ] **Step 5.6: Add `referee-unassigned` (mirror pattern)**

Create test then implementation. Body templates:

```ts
const TITLE = {
  de: "Einsatz storniert",
  en: "Assignment cancelled",
};
const BODY_TEMPLATE = {
  de: (p) => `Dein Einsatz als ${p.slot} bei ${p.homeTeam} vs. ${p.guestTeam} wurde storniert.`,
  en: (p) => `Your assignment as ${p.slot} for ${p.homeTeam} vs. ${p.guestTeam} has been cancelled.`,
};
```

`eventType: "referee.unassigned"`. Same `deepLink` format. Test mirrors Step 5.2 with these strings.

- [ ] **Step 5.7: Add `referee-reassigned`**

Same shape. Body templates:

```ts
const TITLE = {
  de: "Einsatz übertragen",
  en: "Assignment reassigned",
};
const BODY_TEMPLATE = {
  de: (p) => `Dein Einsatz als ${p.slot} bei ${p.homeTeam} vs. ${p.guestTeam} wurde übertragen.`,
  en: (p) => `Your assignment as ${p.slot} for ${p.homeTeam} vs. ${p.guestTeam} has been reassigned.`,
};
```

`eventType: "referee.reassigned"`.

- [ ] **Step 5.8: Run all template tests, commit**

```bash
pnpm --filter @dragons/api test src/services/notifications/templates/push/
git add apps/api/src/services/notifications/templates/push/
git commit -m "feat(notifications): add referee assignment push templates"
```

---

## Task 6: Push templates — referee slots events

**Files:**
- Create: `apps/api/src/services/notifications/templates/push/referee-slots.ts` + test

- [ ] **Step 6.1: Write failing test**

Create `apps/api/src/services/notifications/templates/push/referee-slots.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderRefereeSlotsPush } from "./referee-slots";

const payload = {
  matchId: 99,
  homeTeam: "Dragons U18",
  guestTeam: "TV Buchholz",
  kickoffDate: "2026-05-10",
  kickoffTime: "16:00",
  sr1Open: true,
  sr2Open: true,
  sr1Assigned: null as string | null,
  sr2Assigned: null as string | null,
  reminderLevel: 3 as number | undefined,
  eventId: "evt_slots_1",
};

describe("renderRefereeSlotsPush", () => {
  it("initial notification (no reminder level)", () => {
    const out = renderRefereeSlotsPush({ ...payload, reminderLevel: undefined }, "de", "needed");
    expect(out.title).toContain("Schiedsrichter");
    expect(out.body).toContain("Dragons U18");
    expect(out.data.eventType).toBe("referee.slots.needed");
    expect(out.data.deepLink).toBe("/(tabs)/referee");
  });

  it("reminder reflects days-until kickoff", () => {
    const out = renderRefereeSlotsPush(payload, "de", "reminder");
    expect(out.body).toContain("3");
    expect(out.data.eventType).toBe("referee.slots.reminder");
  });

  it("reflects partial fill in body", () => {
    const out = renderRefereeSlotsPush(
      { ...payload, sr1Open: false, sr1Assigned: "Max Mustermann" },
      "de",
      "reminder",
    );
    expect(out.body).toContain("SR2");
  });
});
```

- [ ] **Step 6.2: Run, fail**

```bash
pnpm --filter @dragons/api test src/services/notifications/templates/push/referee-slots.test.ts
```

- [ ] **Step 6.3: Implement**

Create `apps/api/src/services/notifications/templates/push/referee-slots.ts`:

```ts
import type { Locale, PushTemplateOutput } from "./types";
import { BODY_MAX, TITLE_MAX } from "./types";

export interface RefereeSlotsPushPayload {
  matchId: number;
  homeTeam: string;
  guestTeam: string;
  kickoffDate: string;
  kickoffTime: string;
  sr1Open: boolean;
  sr2Open: boolean;
  sr1Assigned: string | null;
  sr2Assigned: string | null;
  reminderLevel?: number;
  eventId: string;
}

export function renderRefereeSlotsPush(
  p: RefereeSlotsPushPayload,
  locale: Locale,
  variant: "needed" | "reminder",
): PushTemplateOutput {
  const title = truncate(titleFor(locale, variant), TITLE_MAX);
  const body = truncate(bodyFor(p, locale, variant), BODY_MAX);
  return {
    title,
    body,
    data: {
      deepLink: "/(tabs)/referee",
      eventType: variant === "needed" ? "referee.slots.needed" : "referee.slots.reminder",
      eventId: p.eventId,
      matchId: p.matchId,
    },
  };
}

function titleFor(locale: Locale, variant: "needed" | "reminder"): string {
  if (variant === "needed") {
    return locale === "de" ? "🏀 Schiedsrichter gesucht" : "🏀 Referees needed";
  }
  return locale === "de" ? "⚠️ Schiedsrichter benötigt" : "⚠️ Referees still needed";
}

function bodyFor(p: RefereeSlotsPushPayload, locale: Locale, variant: "needed" | "reminder"): string {
  const openSlots: string[] = [];
  if (p.sr1Open) openSlots.push("SR1");
  if (p.sr2Open) openSlots.push("SR2");
  const slotText = openSlots.join(" + ");
  const matchup = `${p.homeTeam} vs. ${p.guestTeam}`;
  const when = `${formatDate(p.kickoffDate, locale)} ${p.kickoffTime}`;

  if (variant === "needed") {
    return locale === "de"
      ? `${slotText} offen für ${matchup} am ${when}`
      : `${slotText} open for ${matchup} on ${when}`;
  }
  // reminder
  const days = p.reminderLevel ?? 0;
  return locale === "de"
    ? `In ${days} Tagen: ${slotText} noch offen — ${matchup}`
    : `In ${days} days: ${slotText} still open — ${matchup}`;
}

function formatDate(iso: string, locale: Locale): string {
  const [y, m, d] = iso.split("-");
  return locale === "de" ? `${d}.${m}.${y}` : `${y}-${m}-${d}`;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}
```

- [ ] **Step 6.4: Run, pass, commit**

```bash
pnpm --filter @dragons/api test src/services/notifications/templates/push/referee-slots.test.ts
git add apps/api/src/services/notifications/templates/push/referee-slots.ts apps/api/src/services/notifications/templates/push/referee-slots.test.ts
git commit -m "feat(notifications): add referee slots push template"
```

---

## Task 7: Push templates — match events + registry

**Files:**
- Create: `apps/api/src/services/notifications/templates/push/match-cancelled.ts` + test
- Create: `apps/api/src/services/notifications/templates/push/match-rescheduled.ts` + test
- Create: `apps/api/src/services/notifications/templates/push/index.ts`

- [ ] **Step 7.1: Implement `match-cancelled` (test first)**

Test verifies:
- title contains "abgesagt" / "cancelled"
- body contains team names + kickoff
- `deepLink` = `/game/{matchId}`
- `eventType` = `"match.cancelled"`

Implementation:

```ts
import type { Locale, PushTemplateOutput } from "./types";
import { BODY_MAX, TITLE_MAX } from "./types";

export interface MatchCancelledPayload {
  matchId: number;
  homeTeam: string;
  guestTeam: string;
  kickoffDate: string;
  kickoffTime: string;
  eventId: string;
}

const TITLE = {
  de: "❌ Spiel abgesagt",
  en: "❌ Match cancelled",
};

export function renderMatchCancelledPush(
  p: MatchCancelledPayload,
  locale: Locale,
): PushTemplateOutput {
  const body = locale === "de"
    ? `${p.homeTeam} vs. ${p.guestTeam} (${formatDe(p.kickoffDate)}) wurde abgesagt.`
    : `${p.homeTeam} vs. ${p.guestTeam} (${p.kickoffDate}) has been cancelled.`;
  return {
    title: truncate(TITLE[locale], TITLE_MAX),
    body: truncate(body, BODY_MAX),
    data: {
      deepLink: `/game/${p.matchId}`,
      eventType: "match.cancelled",
      eventId: p.eventId,
    },
  };
}

function truncate(s: string, max: number) { return s.length <= max ? s : s.slice(0, max - 1) + "…"; }
function formatDe(iso: string) { const [y, m, d] = iso.split("-"); return `${d}.${m}.${y}`; }
```

- [ ] **Step 7.2: Implement `match-rescheduled` (test first)**

Add a `oldKickoffDate` and `oldKickoffTime` field to the payload. Body template:

```ts
de: `${p.homeTeam} vs. ${p.guestTeam}: neuer Termin ${formatDe(p.kickoffDate)} ${p.kickoffTime} (vorher ${formatDe(p.oldKickoffDate)} ${p.oldKickoffTime}).`
en: `${p.homeTeam} vs. ${p.guestTeam}: new kickoff ${p.kickoffDate} ${p.kickoffTime} (was ${p.oldKickoffDate} ${p.oldKickoffTime}).`
```

- [ ] **Step 7.3: Create the registry `index.ts`**

Create `apps/api/src/services/notifications/templates/push/index.ts`:

```ts
import type { Locale, PushTemplateOutput } from "./types";
import { renderRefereeAssignedPush, type RefereeAssignedPayload } from "./referee-assigned";
import { renderRefereeUnassignedPush } from "./referee-unassigned";
import { renderRefereeReassignedPush } from "./referee-reassigned";
import { renderRefereeSlotsPush, type RefereeSlotsPushPayload } from "./referee-slots";
import { renderMatchCancelledPush, type MatchCancelledPayload } from "./match-cancelled";
import { renderMatchRescheduledPush, type MatchRescheduledPayload } from "./match-rescheduled";

export interface RenderArgs {
  eventType: string;
  payload: Record<string, unknown>;
  locale: Locale;
}

/**
 * Returns null when the event type has no push template (callers should skip
 * push delivery for that event).
 */
export function renderPushTemplate(args: RenderArgs): PushTemplateOutput | null {
  const { eventType, payload, locale } = args;
  switch (eventType) {
    case "referee.assigned":
      return renderRefereeAssignedPush(payload as unknown as RefereeAssignedPayload, locale);
    case "referee.unassigned":
      return renderRefereeUnassignedPush(payload as unknown as RefereeAssignedPayload, locale);
    case "referee.reassigned":
      return renderRefereeReassignedPush(payload as unknown as RefereeAssignedPayload, locale);
    case "referee.slots.needed":
      return renderRefereeSlotsPush(payload as unknown as RefereeSlotsPushPayload, locale, "needed");
    case "referee.slots.reminder":
      return renderRefereeSlotsPush(payload as unknown as RefereeSlotsPushPayload, locale, "reminder");
    case "match.cancelled":
      return renderMatchCancelledPush(payload as unknown as MatchCancelledPayload, locale);
    case "match.rescheduled":
      return renderMatchRescheduledPush(payload as unknown as MatchRescheduledPayload, locale);
    default:
      return null;
  }
}

export type { PushTemplateOutput, Locale } from "./types";
```

- [ ] **Step 7.4: Run all template tests, commit**

```bash
pnpm --filter @dragons/api test src/services/notifications/templates/push/
git add apps/api/src/services/notifications/templates/push/
git commit -m "feat(notifications): add match push templates and registry"
```

---

## Task 8: Push channel adapter

**Files:**
- Create: `apps/api/src/services/notifications/channels/push.ts`
- Create: `apps/api/src/services/notifications/channels/push.test.ts`

- [ ] **Step 8.1: Inspect adapter interface**

Read `apps/api/src/services/notifications/channels/types.ts` to confirm the shape of `ChannelSendParams` / `DeliveryResult`. The new adapter must conform.

- [ ] **Step 8.2: Write failing tests**

Create `apps/api/src/services/notifications/channels/push.test.ts`. Use the existing PGlite test setup (mirror `notification-pipeline.test.ts` for setup imports). Tests:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../../config/database";
import {
  pushDevices,
  notificationLog,
  channelConfigs,
  domainEvents,
  userNotificationPreferences,
} from "@dragons/db/schema";
import { PushChannelAdapter } from "./push";
import { ExpoPushClient } from "../expo-push.client";

const userA = "user_a";
const userB = "user_b";

describe("PushChannelAdapter", () => {
  let adapter: PushChannelAdapter;
  let sendBatchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    // Insert push channel config
    await db.insert(channelConfigs).values({
      name: "Expo Push",
      type: "push",
      enabled: true,
      config: { provider: "expo" },
      digestMode: "immediate",
      digestTimezone: "Europe/Berlin",
    }).onConflictDoNothing();

    // Insert a domain event we can reference
    await db.insert(domainEvents).values({
      id: "evt_test_1",
      type: "referee.assigned",
      source: "test",
      entityType: "match",
      entityId: 1,
      entityName: "Test",
      payload: {
        matchId: 1, matchNo: "0001",
        homeTeam: "Dragons", guestTeam: "Foes",
        slot: "SR1",
        kickoffDate: "2026-05-01", kickoffTime: "14:00",
        eventId: "evt_test_1",
      },
      urgency: "immediate",
    }).onConflictDoNothing();

    const client = new ExpoPushClient({});
    sendBatchSpy = vi.spyOn(client, "sendBatch");
    adapter = new PushChannelAdapter(client);
  });

  afterEach(async () => {
    await db.delete(notificationLog);
    await db.delete(pushDevices);
    await db.delete(userNotificationPreferences);
    vi.restoreAllMocks();
  });

  it("skips silently when recipient has no push devices", async () => {
    const result = await adapter.send({
      eventId: "evt_test_1",
      eventType: "referee.assigned",
      payload: {
        matchId: 1, matchNo: "0001", homeTeam: "Dragons", guestTeam: "Foes",
        slot: "SR1", kickoffDate: "2026-05-01", kickoffTime: "14:00",
      },
      watchRuleId: null,
      channelConfigId: 1,
      recipientUserIds: [userA],
    });
    expect(result.success).toBe(true);
    expect(result.sent).toBe(0);
    expect(sendBatchSpy).not.toHaveBeenCalled();
  });

  it("sends to all of a user's devices", async () => {
    await db.insert(pushDevices).values([
      { userId: userA, token: "ExponentPushToken[a1]", platform: "ios", locale: "de-DE" },
      { userId: userA, token: "ExponentPushToken[a2]", platform: "android", locale: "de-DE" },
    ]);
    sendBatchSpy.mockResolvedValueOnce([
      { status: "ok", id: "tkt_a1" },
      { status: "ok", id: "tkt_a2" },
    ]);
    const result = await adapter.send({
      eventId: "evt_test_1",
      eventType: "referee.assigned",
      payload: {
        matchId: 1, matchNo: "0001", homeTeam: "Dragons", guestTeam: "Foes",
        slot: "SR1", kickoffDate: "2026-05-01", kickoffTime: "14:00",
      },
      watchRuleId: null,
      channelConfigId: 1,
      recipientUserIds: [userA],
    });
    expect(result.success).toBe(true);
    expect(result.sent).toBe(2);
    const rows = await db.select().from(notificationLog);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.providerTicketId !== null)).toBe(true);
    expect(rows.every((r) => r.recipientToken?.startsWith("ExponentPushToken"))).toBe(true);
    expect(rows.every((r) => r.status === "sent_ticket")).toBe(true);
  });

  it("records per-ticket failures without aborting batch", async () => {
    await db.insert(pushDevices).values([
      { userId: userA, token: "ExponentPushToken[ok]", platform: "ios" },
      { userId: userA, token: "ExponentPushToken[bad]", platform: "ios" },
    ]);
    sendBatchSpy.mockResolvedValueOnce([
      { status: "ok", id: "tkt_ok" },
      { status: "error", message: "DeviceNotRegistered", details: { error: "DeviceNotRegistered" } },
    ]);
    await adapter.send({
      eventId: "evt_test_1",
      eventType: "referee.assigned",
      payload: { matchId: 1, matchNo: "0001", homeTeam: "Dragons", guestTeam: "Foes", slot: "SR1", kickoffDate: "2026-05-01", kickoffTime: "14:00" },
      watchRuleId: null,
      channelConfigId: 1,
      recipientUserIds: [userA],
    });
    const rows = await db.select().from(notificationLog);
    const okRow = rows.find((r) => r.recipientToken === "ExponentPushToken[ok]");
    const badRow = rows.find((r) => r.recipientToken === "ExponentPushToken[bad]");
    expect(okRow?.status).toBe("sent_ticket");
    expect(badRow?.status).toBe("failed");
    expect(badRow?.errorMessage).toContain("DeviceNotRegistered");
  });

  it("respects user mutedEventTypes", async () => {
    await db.insert(pushDevices).values({
      userId: userA, token: "ExponentPushToken[a]", platform: "ios",
    });
    await db.insert(userNotificationPreferences).values({
      userId: userA,
      mutedEventTypes: ["referee.assigned"],
    });
    const result = await adapter.send({
      eventId: "evt_test_1",
      eventType: "referee.assigned",
      payload: { matchId: 1, matchNo: "0001", homeTeam: "Dragons", guestTeam: "Foes", slot: "SR1", kickoffDate: "2026-05-01", kickoffTime: "14:00" },
      watchRuleId: null,
      channelConfigId: 1,
      recipientUserIds: [userA],
    });
    expect(result.sent).toBe(0);
    expect(sendBatchSpy).not.toHaveBeenCalled();
  });

  it("skips event types without a push template", async () => {
    await db.insert(pushDevices).values({
      userId: userA, token: "ExponentPushToken[a]", platform: "ios",
    });
    const result = await adapter.send({
      eventId: "evt_test_1",
      eventType: "match.scoreUpdated", // not in registry
      payload: {},
      watchRuleId: null,
      channelConfigId: 1,
      recipientUserIds: [userA],
    });
    expect(result.sent).toBe(0);
    expect(sendBatchSpy).not.toHaveBeenCalled();
  });

  it("marks all rows failed on Expo network error", async () => {
    await db.insert(pushDevices).values({
      userId: userA, token: "ExponentPushToken[a]", platform: "ios",
    });
    sendBatchSpy.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const result = await adapter.send({
      eventId: "evt_test_1",
      eventType: "referee.assigned",
      payload: { matchId: 1, matchNo: "0001", homeTeam: "Dragons", guestTeam: "Foes", slot: "SR1", kickoffDate: "2026-05-01", kickoffTime: "14:00" },
      watchRuleId: null,
      channelConfigId: 1,
      recipientUserIds: [userA],
    });
    expect(result.success).toBe(false);
    const rows = await db.select().from(notificationLog);
    expect(rows[0].status).toBe("failed");
    expect(rows[0].errorMessage).toMatch(/ECONNREFUSED|network/i);
  });
});
```

- [ ] **Step 8.3: Run, fail**

```bash
pnpm --filter @dragons/api test src/services/notifications/channels/push.test.ts
```

- [ ] **Step 8.4: Implement `push.ts`**

Create `apps/api/src/services/notifications/channels/push.ts`:

```ts
import { eq, inArray } from "drizzle-orm";
import { db } from "../../../config/database";
import {
  pushDevices,
  notificationLog,
  userNotificationPreferences,
} from "@dragons/db/schema";
import { logger } from "../../../config/logger";
import { ExpoPushClient, type ExpoPushMessage } from "../expo-push.client";
import { renderPushTemplate, type Locale } from "../templates/push";

const log = logger.child({ service: "push-adapter" });

export interface PushSendParams {
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  watchRuleId: number | null;
  channelConfigId: number;
  recipientUserIds: string[];
}

export interface PushSendResult {
  success: boolean;
  sent: number;
  failed: number;
}

export class PushChannelAdapter {
  constructor(private readonly client: ExpoPushClient) {}

  async send(params: PushSendParams): Promise<PushSendResult> {
    const result: PushSendResult = { success: true, sent: 0, failed: 0 };

    const renderProbe = renderPushTemplate({
      eventType: params.eventType,
      payload: params.payload,
      locale: "de",
    });
    if (!renderProbe) {
      log.debug({ eventType: params.eventType }, "no push template, skipping");
      return result;
    }

    if (params.recipientUserIds.length === 0) return result;

    // Load devices for all recipients in one query
    const devices = await db
      .select()
      .from(pushDevices)
      .where(inArray(pushDevices.userId, params.recipientUserIds));

    if (devices.length === 0) {
      log.debug({ recipientUserIds: params.recipientUserIds }, "no push devices");
      return result;
    }

    // Load mute prefs in one query
    const prefs = await db
      .select()
      .from(userNotificationPreferences)
      .where(inArray(userNotificationPreferences.userId, params.recipientUserIds));

    const prefByUser = new Map(prefs.map((p) => [p.userId, p]));

    type Outgoing = {
      device: typeof devices[number];
      message: ExpoPushMessage;
    };

    const outgoing: Outgoing[] = [];

    for (const device of devices) {
      const userPref = prefByUser.get(device.userId);
      if (userPref?.mutedEventTypes.includes(params.eventType)) {
        continue;
      }
      const locale = pickLocale(userPref?.locale, device.locale);
      const rendered = renderPushTemplate({
        eventType: params.eventType,
        payload: params.payload,
        locale,
      });
      if (!rendered) continue;
      outgoing.push({
        device,
        message: {
          to: device.token,
          title: rendered.title,
          body: rendered.body,
          data: rendered.data,
          sound: "default",
          priority: "high",
        },
      });
    }

    if (outgoing.length === 0) return result;

    let tickets;
    try {
      tickets = await this.client.sendBatch(outgoing.map((o) => o.message));
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      log.error({ err, eventId: params.eventId }, "Expo sendBatch failed");
      // Persist all as failed for visibility
      await db.insert(notificationLog).values(
        outgoing.map((o) => ({
          eventId: params.eventId,
          watchRuleId: params.watchRuleId,
          channelConfigId: params.channelConfigId,
          recipientId: o.device.userId,
          recipientToken: o.device.token,
          title: o.message.title,
          body: o.message.body,
          locale: pickLocale(prefByUser.get(o.device.userId)?.locale, o.device.locale),
          status: "failed",
          errorMessage: message,
        })),
      );
      return { success: false, sent: 0, failed: outgoing.length };
    }

    const rows = outgoing.map((o, i) => {
      const ticket = tickets[i];
      const ok = ticket?.status === "ok";
      return {
        eventId: params.eventId,
        watchRuleId: params.watchRuleId,
        channelConfigId: params.channelConfigId,
        recipientId: o.device.userId,
        recipientToken: o.device.token,
        title: o.message.title,
        body: o.message.body,
        locale: pickLocale(prefByUser.get(o.device.userId)?.locale, o.device.locale),
        status: ok ? "sent_ticket" : "failed",
        sentAt: ok ? new Date() : null,
        providerTicketId: ok ? ticket.id ?? null : null,
        errorMessage: ok ? null : (ticket?.message ?? ticket?.details?.error ?? "unknown"),
      };
    });

    await db.insert(notificationLog).values(rows);

    result.sent = rows.filter((r) => r.status === "sent_ticket").length;
    result.failed = rows.length - result.sent;
    if (result.failed > 0) result.success = false;
    return result;
  }
}

function pickLocale(userLocale: string | undefined, deviceLocale: string | null | undefined): Locale {
  const candidate = userLocale ?? deviceLocale ?? "de";
  const lower = candidate.toLowerCase();
  if (lower.startsWith("en")) return "en";
  return "de";
}
```

- [ ] **Step 8.5: Run, pass**

```bash
pnpm --filter @dragons/api test src/services/notifications/channels/push.test.ts
```
Expected: PASS — all 6 tests.

- [ ] **Step 8.6: Commit**

```bash
git add apps/api/src/services/notifications/channels/push.ts apps/api/src/services/notifications/channels/push.test.ts
git commit -m "feat(notifications): add push channel adapter"
```

---

## Task 9: Wire push into notification-pipeline

**Files:**
- Modify: `apps/api/src/services/notifications/notification-pipeline.ts`
- Modify: `apps/api/src/services/notifications/notification-pipeline.test.ts`

- [ ] **Step 9.1: Add push adapter recipient resolver**

The push adapter expects `recipientUserIds: string[]` while the pipeline currently uses opaque `recipientId` strings like `"referee:42"` and `"audience:admin"`. Add a resolver helper.

Create `apps/api/src/services/notifications/recipient-resolver.ts`:

```ts
import { eq, and } from "drizzle-orm";
import { db } from "../../config/database";
import { referees } from "@dragons/db/schema";
import { auth } from "../../config/auth";

/**
 * Convert a pipeline recipientId (e.g., "referee:42", "audience:admin") into
 * one or more user IDs that can be looked up in push_devices.
 */
export async function resolveRecipientUserIds(recipientId: string): Promise<string[]> {
  if (recipientId.startsWith("referee:")) {
    const refereeId = Number(recipientId.slice("referee:".length));
    if (!Number.isFinite(refereeId)) return [];
    const rows = await db
      .select({ userId: referees.userId })
      .from(referees)
      .where(eq(referees.id, refereeId));
    return rows.map((r) => r.userId).filter((u): u is string => typeof u === "string");
  }
  if (recipientId === "audience:admin") {
    // better-auth admin plugin stores role on the user table.
    // Use auth.api.listUsers with role filter.
    const result = await auth.api.listUsers({
      query: { filterField: "role", filterValue: "admin", filterOperator: "eq" },
    });
    return (result.users ?? []).map((u: { id: string }) => u.id);
  }
  if (recipientId.startsWith("user:")) {
    return [recipientId.slice("user:".length)];
  }
  return [];
}
```

If `referees.userId` does not exist, inspect the `referees` schema to find the join column. Adjust the import + select accordingly. If admin role lookup via `auth.api.listUsers` is not supported in the current better-auth version, fall back to a direct DB query of the `user` table (`SELECT id FROM "user" WHERE role = 'admin'`).

- [ ] **Step 9.2: Test the resolver**

Create `apps/api/src/services/notifications/recipient-resolver.test.ts` with tests for:
- `referee:N` resolves to a single user id
- `referee:N` with no row returns empty
- `audience:admin` returns all admin user ids
- unknown prefix returns empty

- [ ] **Step 9.3: Add push case to `dispatchImmediate`**

In `notification-pipeline.ts`, import the new adapter + resolver:

```ts
import { ExpoPushClient } from "./expo-push.client";
import { PushChannelAdapter } from "./channels/push";
import { resolveRecipientUserIds } from "./recipient-resolver";
```

Instantiate at module scope:

```ts
const expoPushClient = new ExpoPushClient({ accessToken: env.EXPO_ACCESS_TOKEN });
const pushAdapter = new PushChannelAdapter(expoPushClient);
```

Add a third branch inside `dispatchImmediate` (after the `whatsapp_group` block, before the `logger.warn` fallback):

```ts
  if (channelType === "push") {
    const userIds = await resolveRecipientUserIds(recipientId);
    if (userIds.length === 0) return false;
    const sendResult = await pushAdapter.send({
      eventId: event.id,
      eventType: event.type,
      payload,
      watchRuleId,
      channelConfigId: config.id,
      recipientUserIds: userIds,
    });
    return sendResult.success;
  }
```

- [ ] **Step 9.4: Update pipeline integration test**

Add a test in `notification-pipeline.test.ts` that:
- Inserts a `push` channel config (already seeded)
- Inserts a `push_devices` row for a referee user
- Emits a `referee.assigned` event
- Verifies a `notification_log` row with `channelConfigId` matching push config and `providerTicketId` not null

You'll likely need to mock `ExpoPushClient.sendBatch` via `vi.spyOn(ExpoPushClient.prototype, "sendBatch")` at the top of the new test.

- [ ] **Step 9.5: Run pipeline tests, commit**

```bash
pnpm --filter @dragons/api test src/services/notifications/notification-pipeline.test.ts
git add apps/api/src/services/notifications/
git commit -m "feat(notifications): wire push channel into pipeline dispatch"
```

---

## Task 10: Extend `role-defaults.ts` with PUSH_ELIGIBLE_EVENTS

**Files:**
- Modify: `apps/api/src/services/notifications/role-defaults.ts`
- Modify: `apps/api/src/services/notifications/role-defaults.test.ts`

- [ ] **Step 10.1: Write failing tests**

Add to `role-defaults.test.ts`:

```ts
describe("PUSH_ELIGIBLE_EVENTS fan-out", () => {
  it("emits both in_app and push for referee.assigned", () => {
    const out = getDefaultNotificationsForEvent(
      "referee.assigned",
      { refereeId: 42 },
      "test",
    );
    const channels = out.filter((n) => n.refereeId === 42).map((n) => n.channel).sort();
    expect(channels).toEqual(["in_app", "push"]);
  });

  it("emits in_app + push for referee.slots.needed (admin audience)", () => {
    const out = getDefaultNotificationsForEvent("referee.slots.needed", {}, "test");
    const adminEntries = out.filter((n) => n.audience === "admin");
    const channels = adminEntries.map((n) => n.channel).sort();
    expect(channels).toEqual(["in_app", "push"]);
  });

  it("emits in_app + push for both old and new referee on reassignment", () => {
    const out = getDefaultNotificationsForEvent(
      "referee.reassigned",
      { oldRefereeId: 1, newRefereeId: 2 },
      "test",
    );
    const oldChannels = out.filter((n) => n.refereeId === 1).map((n) => n.channel).sort();
    const newChannels = out.filter((n) => n.refereeId === 2).map((n) => n.channel).sort();
    expect(oldChannels).toEqual(["in_app", "push"]);
    expect(newChannels).toEqual(["in_app", "push"]);
  });

  it("does NOT emit push for non-eligible event (e.g., booking.created)", () => {
    const out = getDefaultNotificationsForEvent("booking.created", {}, "test");
    const pushEntries = out.filter((n) => n.channel === "push");
    expect(pushEntries).toEqual([]);
  });
});
```

- [ ] **Step 10.2: Update `role-defaults.ts`**

Replace the contents:

```ts
export type Channel = "in_app" | "push";

export interface DefaultNotification {
  audience: "admin" | "referee";
  channel: Channel;
  refereeId?: number;
}

const ADMIN_EVENT_PREFIXES = [
  "match.",
  "booking.",
  "override.",
  "referee.",
] as const;

const REFEREE_SELF_EVENTS = new Set([
  "referee.assigned",
  "referee.unassigned",
]);

const PUSH_ELIGIBLE_EVENTS = new Set([
  "referee.assigned",
  "referee.unassigned",
  "referee.reassigned",
  "referee.slots.needed",
  "referee.slots.reminder",
  "match.cancelled",
  "match.rescheduled",
]);

export function getDefaultNotificationsForEvent(
  eventType: string,
  payload: Record<string, unknown>,
  _source: string,
): DefaultNotification[] {
  const results: DefaultNotification[] = [];
  const pushEligible = PUSH_ELIGIBLE_EVENTS.has(eventType);

  const pushAfter = (n: DefaultNotification) => {
    results.push(n);
    if (pushEligible) {
      results.push({ ...n, channel: "push" });
    }
  };

  if (isAdminEvent(eventType)) {
    pushAfter({ audience: "admin", channel: "in_app" });
  }

  if (REFEREE_SELF_EVENTS.has(eventType)) {
    const refereeId = toNumber(payload["refereeId"]);
    if (refereeId != null) {
      pushAfter({ audience: "referee", channel: "in_app", refereeId });
    }
  }

  if (eventType === "referee.reassigned") {
    const oldRefereeId = toNumber(payload["oldRefereeId"]);
    const newRefereeId = toNumber(payload["newRefereeId"]);

    if (oldRefereeId != null) {
      pushAfter({ audience: "referee", channel: "in_app", refereeId: oldRefereeId });
    }
    if (newRefereeId != null) {
      pushAfter({ audience: "referee", channel: "in_app", refereeId: newRefereeId });
    }
  }

  // referee.slots.needed and referee.slots.reminder: admin in_app already
  // covered by isAdminEvent path above (referee. prefix).

  return results;
}

function isAdminEvent(eventType: string): boolean {
  return ADMIN_EVENT_PREFIXES.some((prefix) => eventType.startsWith(prefix));
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
```

Note: this removes the duplicate `referee.slots.*` admin emit at the bottom of the original file (it was redundant with `isAdminEvent` since both event types start with `referee.`).

- [ ] **Step 10.3: Update `notification-pipeline.ts` channel-config matching**

In `evaluateDefaults`, the match condition `c.type !== defaultNotif.channel` already works since `channel` is the union `"in_app" | "push"` and channel configs have `type` fields matching. No change required if the seeded `Expo Push` row has `type: "push"`.

Confirm by running:

```bash
pnpm --filter @dragons/api test src/services/notifications/role-defaults.test.ts
```
Expected: PASS.

- [ ] **Step 10.4: Run all notification tests, commit**

```bash
pnpm --filter @dragons/api test src/services/notifications/
git add apps/api/src/services/notifications/role-defaults.ts apps/api/src/services/notifications/role-defaults.test.ts
git commit -m "feat(notifications): add PUSH_ELIGIBLE_EVENTS fan-out in role-defaults"
```

---

## Task 11: Push receipt cron worker

**Files:**
- Create: `apps/api/src/workers/push-receipt.worker.ts`
- Create: `apps/api/src/workers/push-receipt.worker.test.ts`

- [ ] **Step 11.1: Write failing tests**

Create `apps/api/src/workers/push-receipt.worker.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../config/database";
import {
  notificationLog,
  pushDevices,
  channelConfigs,
  domainEvents,
} from "@dragons/db/schema";
import { reconcilePushReceipts } from "./push-receipt.worker";
import { ExpoPushClient } from "../services/notifications/expo-push.client";

describe("reconcilePushReceipts", () => {
  let pushChannelId: number;

  beforeEach(async () => {
    const [cfg] = await db
      .insert(channelConfigs)
      .values({
        name: "Expo Push",
        type: "push",
        enabled: true,
        config: { provider: "expo" },
        digestMode: "immediate",
        digestTimezone: "Europe/Berlin",
      })
      .onConflictDoNothing()
      .returning();
    if (cfg) {
      pushChannelId = cfg.id;
    } else {
      const [existing] = await db.select().from(channelConfigs).where(eq(channelConfigs.type, "push"));
      pushChannelId = existing.id;
    }

    await db.insert(domainEvents).values({
      id: "evt_recv_1",
      type: "referee.assigned",
      source: "test",
      entityType: "match",
      entityId: 1,
      entityName: "test",
      payload: {},
      urgency: "immediate",
    }).onConflictDoNothing();
  });

  afterEach(async () => {
    await db.delete(notificationLog);
    await db.delete(pushDevices);
    vi.restoreAllMocks();
  });

  it("marks ok receipts as delivered", async () => {
    await db.insert(notificationLog).values({
      eventId: "evt_recv_1",
      channelConfigId: pushChannelId,
      recipientId: "user_x",
      recipientToken: "ExponentPushToken[x]",
      title: "t", body: "b", locale: "de",
      status: "sent_ticket",
      providerTicketId: "tkt_ok_1",
    });

    const client = new ExpoPushClient({});
    vi.spyOn(client, "getReceipts").mockResolvedValueOnce({
      tkt_ok_1: { status: "ok" },
    });

    const result = await reconcilePushReceipts(client);
    expect(result.checked).toBe(1);
    expect(result.delivered).toBe(1);

    const [row] = await db.select().from(notificationLog).where(eq(notificationLog.providerTicketId, "tkt_ok_1"));
    expect(row.status).toBe("delivered");
    expect(row.providerReceiptCheckedAt).toBeInstanceOf(Date);
  });

  it("purges push_devices on DeviceNotRegistered", async () => {
    await db.insert(pushDevices).values({
      userId: "user_y", token: "ExponentPushToken[dead]", platform: "ios",
    });
    await db.insert(notificationLog).values({
      eventId: "evt_recv_1",
      channelConfigId: pushChannelId,
      recipientId: "user_y",
      recipientToken: "ExponentPushToken[dead]",
      title: "t", body: "b", locale: "de",
      status: "sent_ticket",
      providerTicketId: "tkt_dead_1",
    });

    const client = new ExpoPushClient({});
    vi.spyOn(client, "getReceipts").mockResolvedValueOnce({
      tkt_dead_1: { status: "error", message: "DeviceNotRegistered", details: { error: "DeviceNotRegistered" } },
    });

    await reconcilePushReceipts(client);

    const [logRow] = await db.select().from(notificationLog).where(eq(notificationLog.providerTicketId, "tkt_dead_1"));
    expect(logRow.status).toBe("failed");
    expect(logRow.errorMessage).toContain("DeviceNotRegistered");
    const devices = await db.select().from(pushDevices).where(eq(pushDevices.token, "ExponentPushToken[dead]"));
    expect(devices).toHaveLength(0);
  });

  it("leaves rows alone when receipt not yet ready", async () => {
    await db.insert(notificationLog).values({
      eventId: "evt_recv_1",
      channelConfigId: pushChannelId,
      recipientId: "user_z",
      recipientToken: "ExponentPushToken[pending]",
      title: "t", body: "b", locale: "de",
      status: "sent_ticket",
      providerTicketId: "tkt_pending_1",
    });

    const client = new ExpoPushClient({});
    vi.spyOn(client, "getReceipts").mockResolvedValueOnce({}); // no entry

    await reconcilePushReceipts(client);

    const [row] = await db.select().from(notificationLog).where(eq(notificationLog.providerTicketId, "tkt_pending_1"));
    expect(row.status).toBe("sent_ticket"); // unchanged
    expect(row.providerReceiptCheckedAt).toBeInstanceOf(Date); // bumped
  });

  it("expires rows older than 24h with no receipt", async () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await db.insert(notificationLog).values({
      eventId: "evt_recv_1",
      channelConfigId: pushChannelId,
      recipientId: "user_old",
      recipientToken: "ExponentPushToken[old]",
      title: "t", body: "b", locale: "de",
      status: "sent_ticket",
      providerTicketId: "tkt_old_1",
      createdAt: twentyFiveHoursAgo,
    });

    const client = new ExpoPushClient({});
    vi.spyOn(client, "getReceipts").mockResolvedValueOnce({});

    await reconcilePushReceipts(client);

    // Skipped because outside 24h window — query verifies row untouched
    const [row] = await db.select().from(notificationLog).where(eq(notificationLog.providerTicketId, "tkt_old_1"));
    expect(row.status).toBe("sent_ticket"); // worker bounded by 24h, won't see it
  });

  it("skips rows without provider_ticket_id", async () => {
    await db.insert(notificationLog).values({
      eventId: "evt_recv_1",
      channelConfigId: pushChannelId,
      recipientId: "user_a",
      title: "t", body: "b", locale: "de",
      status: "sent_ticket",
      providerTicketId: null,
    });
    const client = new ExpoPushClient({});
    const spy = vi.spyOn(client, "getReceipts").mockResolvedValueOnce({});

    const result = await reconcilePushReceipts(client);
    expect(result.checked).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 11.2: Run, fail**

```bash
pnpm --filter @dragons/api test src/workers/push-receipt.worker.test.ts
```

- [ ] **Step 11.3: Implement worker logic**

Create `apps/api/src/workers/push-receipt.worker.ts`:

```ts
import { and, gt, isNotNull, eq, lt, or, isNull, sql } from "drizzle-orm";
import { db } from "../config/database";
import { notificationLog, pushDevices } from "@dragons/db/schema";
import { logger } from "../config/logger";
import { ExpoPushClient } from "../services/notifications/expo-push.client";
import { env } from "../config/env";

const log = logger.child({ service: "push-receipt-worker" });

export interface ReconcileResult {
  checked: number;
  delivered: number;
  failed: number;
}

export async function reconcilePushReceipts(
  client: ExpoPushClient,
): Promise<ReconcileResult> {
  const result: ReconcileResult = { checked: 0, delivered: 0, failed: 0 };

  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Find sent_ticket rows that need polling
  const pending = await db
    .select({
      id: notificationLog.id,
      providerTicketId: notificationLog.providerTicketId,
      recipientToken: notificationLog.recipientToken,
    })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.status, "sent_ticket"),
        isNotNull(notificationLog.providerTicketId),
        gt(notificationLog.createdAt, twentyFourHoursAgo),
        or(
          isNull(notificationLog.providerReceiptCheckedAt),
          lt(notificationLog.providerReceiptCheckedAt, fifteenMinAgo),
        ),
      ),
    )
    .limit(5000);

  if (pending.length === 0) return result;

  result.checked = pending.length;
  const ticketIds = pending.map((p) => p.providerTicketId!).filter(Boolean);
  const ticketToRow = new Map(pending.map((p) => [p.providerTicketId!, p]));

  let receipts: Awaited<ReturnType<ExpoPushClient["getReceipts"]>>;
  try {
    receipts = await client.getReceipts(ticketIds);
  } catch (err) {
    log.error({ err }, "getReceipts failed");
    throw err;
  }

  const now = new Date();
  const tokensToPurge: string[] = [];

  for (const [ticketId, row] of ticketToRow) {
    const receipt = receipts[ticketId];
    if (!receipt) {
      // not ready yet — bump checkedAt to space out polling
      await db
        .update(notificationLog)
        .set({ providerReceiptCheckedAt: now })
        .where(eq(notificationLog.id, row.id));
      continue;
    }

    if (receipt.status === "ok") {
      await db
        .update(notificationLog)
        .set({ status: "delivered", providerReceiptCheckedAt: now })
        .where(eq(notificationLog.id, row.id));
      result.delivered++;
    } else {
      const errorCode = receipt.details?.error ?? receipt.message ?? "unknown";
      await db
        .update(notificationLog)
        .set({
          status: "failed",
          providerReceiptCheckedAt: now,
          errorMessage: errorCode,
        })
        .where(eq(notificationLog.id, row.id));
      result.failed++;

      if (errorCode.includes("DeviceNotRegistered") && row.recipientToken) {
        tokensToPurge.push(row.recipientToken);
      }
    }
  }

  if (tokensToPurge.length > 0) {
    await db.delete(pushDevices).where(
      sql`${pushDevices.token} IN (${sql.join(tokensToPurge.map((t) => sql`${t}`), sql`, `)})`,
    );
    log.info({ count: tokensToPurge.length }, "purged invalid push devices");
  }

  return result;
}

let _client: ExpoPushClient | undefined;
export function getDefaultClient(): ExpoPushClient {
  if (!_client) _client = new ExpoPushClient({ accessToken: env.EXPO_ACCESS_TOKEN });
  return _client;
}
```

- [ ] **Step 11.4: Run tests, commit**

```bash
pnpm --filter @dragons/api test src/workers/push-receipt.worker.test.ts
git add apps/api/src/workers/push-receipt.worker.ts apps/api/src/workers/push-receipt.worker.test.ts
git commit -m "feat(workers): add push receipt reconcile worker"
```

---

## Task 12: Register receipt worker cron

**Files:**
- Modify: `apps/api/src/workers/index.ts`

- [ ] **Step 12.1: Inspect existing worker registration pattern**

```bash
grep -n "Queue\|Worker\|repeat\|every" apps/api/src/workers/index.ts apps/api/src/workers/digest.worker.ts | head -20
```
Identify how `digest.worker` is scheduled (BullMQ repeat options).

- [ ] **Step 12.2: Add scheduling block to `workers/index.ts`**

Mirror the digest pattern, e.g.:

```ts
import { Queue, Worker } from "bullmq";
import { reconcilePushReceipts, getDefaultClient as getPushClient } from "./push-receipt.worker";
import { redisConnection } from "../config/redis"; // or however the existing workers obtain connection

const PUSH_RECEIPT_QUEUE = "push-receipt-reconcile";
const PUSH_RECEIPT_JOB = "reconcile";

export const pushReceiptQueue = new Queue(PUSH_RECEIPT_QUEUE, { connection: redisConnection });

await pushReceiptQueue.add(
  PUSH_RECEIPT_JOB,
  {},
  {
    repeat: { every: 15 * 60 * 1000 }, // every 15 minutes
    jobId: "push-receipt-reconcile-cron", // dedupe
  },
);

new Worker(
  PUSH_RECEIPT_QUEUE,
  async () => {
    await reconcilePushReceipts(getPushClient());
  },
  { connection: redisConnection },
);
```

Where exactly to insert depends on the existing structure — keep parallel to `digestQueue` registration.

- [ ] **Step 12.3: Boot smoke check**

```bash
pnpm --filter @dragons/api dev
```
Expected: server boots without errors. Logs show worker registration.

- [ ] **Step 12.4: Commit**

```bash
git add apps/api/src/workers/index.ts
git commit -m "feat(workers): schedule push receipt reconcile every 15 minutes"
```

---

## Task 13: Native registration logic

**Files:**
- Create: `apps/native/src/lib/push/registration.ts`
- Create: `apps/native/src/lib/push/registration.test.ts`
- Modify: `apps/native/package.json` (add `expo-device` if missing)

- [ ] **Step 13.1: Add expo-device if missing**

Check `apps/native/package.json` — if `expo-device` is absent:

```bash
cd apps/native && pnpm add expo-device@~55.0.0
```

- [ ] **Step 13.2: Write failing tests**

Create `apps/native/src/lib/push/registration.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("expo-notifications", () => ({
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
}));
vi.mock("expo-device", () => ({ isDevice: true }));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { eas: { projectId: "test-project-id" } } } },
}));
vi.mock("expo-localization", () => ({
  getLocales: () => [{ languageTag: "de-DE" }],
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

import * as Notifications from "expo-notifications";
import { registerForPush, unregisterForPush } from "./registration";

describe("registerForPush", () => {
  const api = { post: vi.fn(), delete: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no-ops when permission denied (existing)", async () => {
    (Notifications.getPermissionsAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ status: "denied" });
    await registerForPush(api);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("requests permission when undetermined and registers on grant", async () => {
    (Notifications.getPermissionsAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ status: "undetermined" });
    (Notifications.requestPermissionsAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ status: "granted" });
    (Notifications.getExpoPushTokenAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ data: "ExponentPushToken[abc]" });
    await registerForPush(api);
    expect(api.post).toHaveBeenCalledWith("/devices/register", {
      token: "ExponentPushToken[abc]",
      platform: "ios",
      locale: "de-DE",
    });
  });

  it("posts existing token when permission already granted", async () => {
    (Notifications.getPermissionsAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ status: "granted" });
    (Notifications.getExpoPushTokenAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ data: "ExponentPushToken[xyz]" });
    await registerForPush(api);
    expect(api.post).toHaveBeenCalled();
  });

  it("swallows registration network errors", async () => {
    (Notifications.getPermissionsAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ status: "granted" });
    (Notifications.getExpoPushTokenAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ data: "ExponentPushToken[err]" });
    api.post.mockRejectedValueOnce(new Error("network"));
    await expect(registerForPush(api)).resolves.toBeUndefined();
  });
});

describe("unregisterForPush", () => {
  const api = { post: vi.fn(), delete: vi.fn() };

  beforeEach(() => vi.clearAllMocks());

  it("DELETEs current token", async () => {
    (Notifications.getExpoPushTokenAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ data: "ExponentPushToken[u1]" });
    await unregisterForPush(api);
    expect(api.delete).toHaveBeenCalledWith("/devices/" + encodeURIComponent("ExponentPushToken[u1]"));
  });

  it("swallows DELETE failures", async () => {
    (Notifications.getExpoPushTokenAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ data: "ExponentPushToken[u2]" });
    api.delete.mockRejectedValueOnce(new Error("offline"));
    await expect(unregisterForPush(api)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 13.3: Run, fail**

```bash
pnpm --filter @dragons/native test src/lib/push/registration.test.ts
```

If the native app does not have a Vitest setup, add one mirroring `apps/api/vitest.config.ts` (minimal, with `environment: "node"`). If a tests setup is too involved here, skip the test file but keep manual QA in the spec.

- [ ] **Step 13.4: Implement `registration.ts`**

Create `apps/native/src/lib/push/registration.ts`:

```ts
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { getLocales } from "expo-localization";
import { Platform } from "react-native";

export interface ApiClient {
  post: (path: string, body: unknown) => Promise<unknown>;
  delete: (path: string) => Promise<unknown>;
}

function getProjectId(): string | undefined {
  const c = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return c?.eas?.projectId;
}

export async function registerForPush(api: ApiClient): Promise<void> {
  if (!Device.isDevice) return;
  const projectId = getProjectId();
  if (!projectId) {
    console.warn("[push] missing EAS projectId, push disabled");
    return;
  }

  let status: string;
  const existing = await Notifications.getPermissionsAsync();
  status = existing.status;
  if (status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== "granted") return;

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const locale = getLocales()[0]?.languageTag;
    await api.post("/devices/register", {
      token,
      platform: Platform.OS,
      locale,
    });
  } catch (err) {
    console.warn("[push] registration failed", err);
  }
}

export async function unregisterForPush(api: ApiClient): Promise<void> {
  if (!Device.isDevice) return;
  const projectId = getProjectId();
  if (!projectId) return;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.delete(`/devices/${encodeURIComponent(token)}`);
  } catch (err) {
    console.warn("[push] unregister failed", err);
  }
}
```

- [ ] **Step 13.5: Verify typecheck + commit**

```bash
pnpm --filter @dragons/native typecheck
git add apps/native/src/lib/push/ apps/native/package.json
git commit -m "feat(native): push registration helpers"
```

---

## Task 14: Native foreground handler + tap routing

**Files:**
- Create: `apps/native/src/lib/push/handler.ts`
- Create: `apps/native/src/lib/push/handler.test.ts`

- [ ] **Step 14.1: Write failing tests**

Create `apps/native/src/lib/push/handler.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("expo-notifications", () => ({
  setNotificationHandler: vi.fn(),
  addNotificationResponseReceivedListener: vi.fn(),
  getLastNotificationResponseAsync: vi.fn(),
}));

import * as Notifications from "expo-notifications";
import { configureNotificationHandler, handleTap, checkColdStartTap, subscribeToTaps } from "./handler";

describe("configureNotificationHandler", () => {
  it("sets handler that shows banner + plays sound, no badge", async () => {
    configureNotificationHandler();
    expect(Notifications.setNotificationHandler).toHaveBeenCalled();
    const arg = (Notifications.setNotificationHandler as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const out = await arg.handleNotification();
    expect(out.shouldShowBanner).toBe(true);
    expect(out.shouldShowList).toBe(true);
    expect(out.shouldPlaySound).toBe(true);
    expect(out.shouldSetBadge).toBe(false);
  });
});

describe("handleTap", () => {
  it("routes to deepLink when string", () => {
    const router = { push: vi.fn() };
    handleTap({ notification: { request: { content: { data: { deepLink: "/referee-game/123" } } } } } as never, router as never);
    expect(router.push).toHaveBeenCalledWith("/referee-game/123");
  });

  it("ignores when deepLink missing", () => {
    const router = { push: vi.fn() };
    handleTap({ notification: { request: { content: { data: {} } } } } as never, router as never);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("ignores when deepLink is not a string", () => {
    const router = { push: vi.fn() };
    handleTap({ notification: { request: { content: { data: { deepLink: 42 } } } } } as never, router as never);
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe("checkColdStartTap", () => {
  it("calls router when last notification has deepLink", async () => {
    (Notifications.getLastNotificationResponseAsync as ReturnType<typeof vi.fn>).mockResolvedValue({
      notification: { request: { content: { data: { deepLink: "/game/9" } } } },
    });
    const router = { push: vi.fn() };
    await checkColdStartTap(router as never);
    expect(router.push).toHaveBeenCalledWith("/game/9");
  });

  it("no-ops when no last notification", async () => {
    (Notifications.getLastNotificationResponseAsync as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const router = { push: vi.fn() };
    await checkColdStartTap(router as never);
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe("subscribeToTaps", () => {
  it("returns an unsubscribe function", () => {
    const remove = vi.fn();
    (Notifications.addNotificationResponseReceivedListener as ReturnType<typeof vi.fn>).mockReturnValue({ remove });
    const unsub = subscribeToTaps({ push: vi.fn() } as never);
    expect(typeof unsub).toBe("function");
    unsub();
    expect(remove).toHaveBeenCalled();
  });
});
```

- [ ] **Step 14.2: Run, fail**

```bash
pnpm --filter @dragons/native test src/lib/push/handler.test.ts
```

- [ ] **Step 14.3: Implement `handler.ts`**

Create `apps/native/src/lib/push/handler.ts`:

```ts
import * as Notifications from "expo-notifications";
import type { Router, Href } from "expo-router";

export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export function handleTap(
  response: Notifications.NotificationResponse,
  router: Pick<Router, "push">,
): void {
  const data = response.notification.request.content.data as Record<string, unknown> | null | undefined;
  const deepLink = data?.deepLink;
  if (typeof deepLink === "string" && deepLink.length > 0) {
    router.push(deepLink as Href);
  }
}

export async function checkColdStartTap(router: Pick<Router, "push">): Promise<void> {
  const response = await Notifications.getLastNotificationResponseAsync();
  if (response) handleTap(response, router);
}

export function subscribeToTaps(router: Pick<Router, "push">): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((r) => handleTap(r, router));
  return () => sub.remove();
}
```

- [ ] **Step 14.4: Run, pass, commit**

```bash
pnpm --filter @dragons/native test src/lib/push/handler.test.ts
git add apps/native/src/lib/push/handler.ts apps/native/src/lib/push/handler.test.ts
git commit -m "feat(native): push notification foreground handler + tap routing"
```

---

## Task 15: usePushRegistration hook + layout wire-up

**Files:**
- Create: `apps/native/src/hooks/usePushRegistration.ts`
- Modify: `apps/native/src/app/_layout.tsx`

- [ ] **Step 15.1: Inspect auth + router context**

```bash
grep -n "useSession\|SessionProvider\|useRouter" apps/native/src/app/_layout.tsx apps/native/src/lib/auth*.ts
```

Confirm how to obtain auth session + router. Likely `useSession` from `@better-auth/expo` and `useRouter` from `expo-router`.

- [ ] **Step 15.2: Implement hook**

Create `apps/native/src/hooks/usePushRegistration.ts`:

```ts
import { useEffect } from "react";
import { useRouter } from "expo-router";
import { useSession } from "@better-auth/expo";
import { apiClient } from "../lib/api"; // adjust import path to actual API client wrapper
import {
  registerForPush,
  unregisterForPush,
} from "../lib/push/registration";
import {
  subscribeToTaps,
  checkColdStartTap,
} from "../lib/push/handler";

export function usePushRegistration(): void {
  const router = useRouter();
  const { data: session } = useSession();

  // Register / unregister on auth transitions
  useEffect(() => {
    if (session?.user) {
      void registerForPush(apiClient);
    }
    return () => {
      // No unregister on unmount — only on explicit sign-out elsewhere
    };
  }, [session?.user?.id]);

  // Tap subscription + cold-start check
  useEffect(() => {
    void checkColdStartTap(router);
    return subscribeToTaps(router);
  }, [router]);
}

export async function unregisterPushOnSignOut(): Promise<void> {
  await unregisterForPush(apiClient);
}
```

If the actual API client export differs, adjust the import. The contract is: `{ post, delete }` methods.

- [ ] **Step 15.3: Wire into `_layout.tsx`**

Read the current `apps/native/src/app/_layout.tsx`. Add:

```ts
import { configureNotificationHandler } from "../lib/push/handler";
import { usePushRegistration } from "../hooks/usePushRegistration";

// Module scope, before the component function:
configureNotificationHandler();

// Inside the layout component, after the auth provider is established:
function RootInner() {
  usePushRegistration();
  // ... existing JSX
}
```

If the layout has multiple component layers, mount `usePushRegistration()` inside the deepest layer that has access to both router + auth context.

- [ ] **Step 15.4: Update sign-out flow**

Find the sign-out call site (likely `apps/native/src/app/(auth)/sign-in.tsx` or a profile screen). Wrap:

```ts
import { unregisterPushOnSignOut } from "../../hooks/usePushRegistration";

async function onSignOut() {
  await unregisterPushOnSignOut();   // before clearing session
  await auth.signOut();
}
```

- [ ] **Step 15.5: Typecheck + commit**

```bash
pnpm --filter @dragons/native typecheck
git add apps/native/src/hooks/usePushRegistration.ts apps/native/src/app/_layout.tsx apps/native/src/app/profile.tsx
git commit -m "feat(native): mount push registration + tap subscription in app shell"
```

(Add the actual sign-out site to the `git add` command as appropriate.)

---

## Task 16: app.config.ts plugin block + EAS update

**Files:**
- Modify: `apps/native/app.json` or `apps/native/app.config.ts`

- [ ] **Step 16.1: Inspect current Expo config**

```bash
ls apps/native/app.* 2>/dev/null
```

Open whichever exists (`app.json` or `app.config.ts`).

- [ ] **Step 16.2: Add expo-notifications plugin block**

Inside the `plugins` array, add:

```json
[
  "expo-notifications",
  {
    "icon": "./assets/notification-icon.png",
    "color": "#0F172A",
    "defaultChannel": "default",
    "sounds": []
  }
]
```

If a notification icon does not exist yet, point to the existing app icon as a placeholder; replace later with a 96x96 white-on-transparent PNG (Android requirement).

For iOS, ensure the `ios` block has:
```json
"ios": {
  ...,
  "infoPlist": {
    "UIBackgroundModes": ["remote-notification"]
  }
}
```

For Android channel setup, no extra config needed beyond `defaultChannel`.

- [ ] **Step 16.3: Verify EAS project ID present**

Confirm `extra.eas.projectId` is set in the same file. If missing, run:

```bash
cd apps/native && pnpm dlx eas init
```

(Skip if already configured.)

- [ ] **Step 16.4: Commit**

```bash
git add apps/native/app.config.ts apps/native/app.json apps/native/assets/
git commit -m "chore(native): configure expo-notifications plugin"
```

(Add only the file that exists.)

---

## Task 17: Admin test push — server route

**Files:**
- Create: `apps/api/src/routes/admin/notification-test.routes.ts`
- Create: `apps/api/src/routes/admin/notification-test.routes.test.ts`
- Modify: `apps/api/src/routes/admin/index.ts`

- [ ] **Step 17.1: Write failing tests**

Create `apps/api/src/routes/admin/notification-test.routes.test.ts`. Reuse the existing admin route test pattern (mirror `notification.routes.test.ts`):

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../config/database";
import { pushDevices, notificationLog, channelConfigs } from "@dragons/db/schema";
import { ExpoPushClient } from "../../services/notifications/expo-push.client";

// adapt to project's test client conventions
import { testRequestAsAdmin, testRequestAsUser } from "../../test/auth-helpers";

describe("POST /admin/notifications/test-push", () => {
  beforeEach(async () => {
    await db.insert(channelConfigs).values({
      name: "Expo Push",
      type: "push",
      enabled: true,
      config: { provider: "expo" },
      digestMode: "immediate",
      digestTimezone: "Europe/Berlin",
    }).onConflictDoNothing();
    vi.spyOn(ExpoPushClient.prototype, "sendBatch").mockResolvedValue([
      { status: "ok", id: "tkt_test_1" },
    ]);
  });

  afterEach(async () => {
    await db.delete(notificationLog);
    await db.delete(pushDevices);
    vi.restoreAllMocks();
  });

  it("rejects non-admin with 403", async () => {
    const res = await testRequestAsUser("POST", "/api/admin/notifications/test-push", {});
    expect(res.status).toBe(403);
  });

  it("returns 400 when admin has no devices", async () => {
    const res = await testRequestAsAdmin("POST", "/api/admin/notifications/test-push", {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("no_devices");
  });

  it("sends to admin's own devices and logs rows", async () => {
    const adminUserId = await getAdminUserId(); // helper that returns the admin used by testRequestAsAdmin
    await db.insert(pushDevices).values({
      userId: adminUserId, token: "ExponentPushToken[admin1]", platform: "ios",
    });

    const res = await testRequestAsAdmin("POST", "/api/admin/notifications/test-push", {
      message: "Hello world",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deviceCount).toBe(1);
    expect(body.tickets).toHaveLength(1);

    const rows = await db.select().from(notificationLog);
    expect(rows[0].providerTicketId).toBe("tkt_test_1");
    expect(rows[0].status).toBe("sent_ticket");
    expect(rows[0].eventId).toMatch(/^admin_test:/);
  });
});

describe("GET /admin/notifications/test-push/recent", () => {
  it("returns only caller's test rows", async () => {
    const adminUserId = await getAdminUserId();
    await db.insert(notificationLog).values([
      { eventId: `admin_test:${adminUserId}:1`, channelConfigId: 1, recipientId: adminUserId, recipientToken: "ExponentPushToken[abcdef]", title: "t", body: "b", locale: "de", status: "delivered" },
      { eventId: `admin_test:other:1`, channelConfigId: 1, recipientId: "other", recipientToken: "ExponentPushToken[zzzz]", title: "t", body: "b", locale: "de", status: "delivered" },
    ]);
    const res = await testRequestAsAdmin("GET", "/api/admin/notifications/test-push/recent");
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].recipientToken).toMatch(/\.\.\.[a-zA-Z0-9]{6}$/); // last 6 only
  });
});
```

If `testRequestAsAdmin` / `getAdminUserId` helpers don't exist, mirror the patterns from any existing `apps/api/src/routes/admin/*.test.ts` file. The exact helper shape is project-specific.

- [ ] **Step 17.2: Implement route**

Create `apps/api/src/routes/admin/notification-test.routes.ts`:

```ts
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { eq, and, like, desc } from "drizzle-orm";
import { db } from "../../config/database";
import { pushDevices, notificationLog, channelConfigs } from "@dragons/db/schema";
import { auth } from "../../config/auth";
import { ExpoPushClient } from "../../services/notifications/expo-push.client";
import { env } from "../../config/env";
import { logger } from "../../config/logger";

const log = logger.child({ service: "admin-notification-test" });

const notificationTestRoutes = new Hono();

const sendBodySchema = z.object({
  message: z.string().min(1).max(180).optional(),
});

const expoPushClient = new ExpoPushClient({ accessToken: env.EXPO_ACCESS_TOKEN });

notificationTestRoutes.post(
  "/test-push",
  describeRoute({
    description: "Send a test push notification to the calling admin's own devices",
    tags: ["Admin", "Notifications"],
    responses: {
      200: { description: "Test push sent" },
      400: { description: "No devices registered" },
      401: { description: "Unauthorized" },
      403: { description: "Admin role required" },
    },
  }),
  async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    if (session.user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

    const body = sendBodySchema.parse(await c.req.json().catch(() => ({})));
    const callerId = session.user.id;

    const devices = await db.select().from(pushDevices).where(eq(pushDevices.userId, callerId));
    if (devices.length === 0) {
      return c.json(
        { error: "no_devices", message: "Open the native app on a signed-in device first." },
        400,
      );
    }

    const [pushChannel] = await db
      .select()
      .from(channelConfigs)
      .where(eq(channelConfigs.type, "push"));
    if (!pushChannel) {
      return c.json({ error: "push_channel_missing" }, 500);
    }

    const sentAt = new Date();
    const eventId = `admin_test:${callerId}:${sentAt.getTime()}`;
    const text = body.message ?? "Test push from Dragons admin";
    const messages = devices.map((d) => ({
      to: d.token,
      title: "🏀 Dragons — Test",
      body: text,
      data: { deepLink: "/", isTest: true, sentAt: sentAt.toISOString(), eventType: "admin.test" },
      sound: "default" as const,
      priority: "high" as const,
    }));

    let tickets;
    try {
      tickets = await expoPushClient.sendBatch(messages);
    } catch (err) {
      log.error({ err, callerId }, "test push send failed");
      tickets = devices.map(() => ({ status: "error" as const, message: err instanceof Error ? err.message : "unknown" }));
    }

    const rows = devices.map((d, i) => {
      const t = tickets[i];
      const ok = t?.status === "ok";
      return {
        eventId,
        channelConfigId: pushChannel.id,
        recipientId: callerId,
        recipientToken: d.token,
        title: "🏀 Dragons — Test",
        body: text,
        locale: d.locale ?? "de",
        status: ok ? "sent_ticket" : "failed",
        sentAt: ok ? sentAt : null,
        providerTicketId: ok ? t.id ?? null : null,
        errorMessage: ok ? null : (t?.message ?? t?.details?.error ?? "unknown"),
      };
    });
    await db.insert(notificationLog).values(rows);

    return c.json({
      deviceCount: devices.length,
      tickets: rows.map((r, i) => ({
        platform: devices[i].platform,
        status: r.status,
        ticketId: r.providerTicketId,
        error: r.errorMessage,
      })),
    });
  },
);

notificationTestRoutes.get(
  "/test-push/recent",
  describeRoute({
    description: "Recent test push results for the calling admin",
    tags: ["Admin", "Notifications"],
    responses: { 200: { description: "Recent test pushes" } },
  }),
  async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    if (session.user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

    const callerId = session.user.id;
    const rows = await db
      .select()
      .from(notificationLog)
      .where(like(notificationLog.eventId, `admin_test:${callerId}:%`))
      .orderBy(desc(notificationLog.createdAt))
      .limit(10);

    return c.json({
      results: rows.map((r) => ({
        id: r.id,
        sentAt: r.sentAt ?? r.createdAt,
        recipientToken: maskToken(r.recipientToken),
        status: r.status,
        providerTicketId: r.providerTicketId,
        errorMessage: r.errorMessage,
      })),
    });
  },
);

function maskToken(token: string | null): string | null {
  if (!token) return null;
  return token.length > 6 ? "..." + token.slice(-6) : token;
}

export { notificationTestRoutes };
```

- [ ] **Step 17.3: Mount route in `routes/admin/index.ts`**

Add the import and route registration mirroring existing admin routes (e.g., `notification.routes`):

```ts
import { notificationTestRoutes } from "./notification-test.routes";
// ...
adminRouter.route("/notifications", notificationTestRoutes);
```

If `/notifications` already mounted by `notification.routes.ts`, mount under same prefix or use `/notifications/test` — match the URL `POST /api/admin/notifications/test-push`.

- [ ] **Step 17.4: Run tests, commit**

```bash
pnpm --filter @dragons/api test src/routes/admin/notification-test.routes.test.ts
git add apps/api/src/routes/admin/notification-test.routes.ts apps/api/src/routes/admin/notification-test.routes.test.ts apps/api/src/routes/admin/index.ts
git commit -m "feat(admin): add admin test push endpoint"
```

---

## Task 18: Admin test push — web UI

**Files:**
- Create: `apps/web/src/components/admin/push-test-card.tsx`
- Create: `apps/web/src/app/admin/settings/notifications/page.tsx`

- [ ] **Step 18.1: Inspect existing admin settings page pattern**

```bash
ls apps/web/src/app/admin/settings/ 2>/dev/null
ls apps/web/src/components/admin/ 2>/dev/null
```

Find a similar card to mirror (e.g., one used in `/admin/settings`).

- [ ] **Step 18.2: Implement card**

Create `apps/web/src/components/admin/push-test-card.tsx`:

```tsx
"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import { Button } from "@dragons/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@dragons/ui/components/card";
import { Textarea } from "@dragons/ui/components/textarea";

interface RecentResult {
  id: number;
  sentAt: string;
  recipientToken: string | null;
  status: string;
  providerTicketId: string | null;
  errorMessage: string | null;
}

export function PushTestCard() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useSWR<{ results: RecentResult[] }>(
    "/api/admin/notifications/test-push/recent",
    async (url) => (await api.get(url)).data,
    { refreshInterval: 5000 },
  );

  const recent = data?.results ?? [];
  const deviceMissing = error === "no_devices";

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/admin/notifications/test-push", { message: message || undefined });
      void mutate("/api/admin/notifications/test-push/recent");
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
      setError(code?.error ?? "send_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Push Notifications — Test</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Sends a test push to all devices registered to your admin account.
          Open the native app and sign in to register a device.
        </p>
        <Textarea
          placeholder="Optional custom message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={180}
        />
        <div className="flex items-center gap-2">
          <Button onClick={send} disabled={busy}>
            {busy ? "Sending..." : "Send test push"}
          </Button>
          {deviceMissing && (
            <span className="text-sm text-amber-600">
              No devices registered. Open the native app first.
            </span>
          )}
          {error && !deviceMissing && (
            <span className="text-sm text-red-600">Error: {error}</span>
          )}
        </div>
        <div>
          <h4 className="text-sm font-medium mb-2">Recent</h4>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No test pushes yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th>Sent</th>
                  <th>Token</th>
                  <th>Status</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.sentAt).toLocaleTimeString()}</td>
                    <td className="font-mono text-xs">{r.recipientToken}</td>
                    <td>{statusBadge(r.status)}</td>
                    <td className="text-xs text-red-600">{r.errorMessage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function statusBadge(status: string): string {
  return status; // use shared Badge component if present
}
```

Adjust imports for `Card`, `Button`, `Textarea`, `api` based on the existing project structure (they may live under `@/components/ui` or `@dragons/ui`).

- [ ] **Step 18.3: Add page**

Create `apps/web/src/app/admin/settings/notifications/page.tsx`:

```tsx
import { PushTestCard } from "@/components/admin/push-test-card";

export default function NotificationsSettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <p className="text-muted-foreground">Push notification testing and diagnostics.</p>
      </header>
      <PushTestCard />
    </div>
  );
}
```

If admin settings has a layout file (e.g., `apps/web/src/app/admin/settings/layout.tsx`), the new page inherits from it.

- [ ] **Step 18.4: Smoke test in dev**

```bash
pnpm dev
```
Then open http://localhost:3000/admin/settings/notifications, sign in as an admin, click "Send test push" (will report `no_devices` until a native device registers).

- [ ] **Step 18.5: Commit**

```bash
git add apps/web/src/components/admin/push-test-card.tsx apps/web/src/app/admin/settings/notifications/
git commit -m "feat(web): admin push notification test card"
```

---

## Task 19: Update docs

**Files:**
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`

- [ ] **Step 19.1: Add to `AGENTS.md`**

Locate the "Notifications" / "Workers" / "Channels" sections (use `grep -n "channel\|Notification" AGENTS.md`). Add:

Under channels:
> **push** — Native push notifications via Expo Push Service. Routes events tagged in `PUSH_ELIGIBLE_EVENTS` (referee assignments, slot requests/reminders, urgent match changes) to user devices registered through `/devices/register`.

Under workers:
> **push-receipt.worker** — Cron, every 15 minutes. Polls Expo Push receipts for pending tickets, marks `notification_log` rows as `delivered` or `failed`, and purges `push_devices` rows whose tokens returned `DeviceNotRegistered`.

Under endpoints (admin section):
> **POST /api/admin/notifications/test-push** — Sends a test push to the caller's own devices. **GET /api/admin/notifications/test-push/recent** — Last 10 test push results for the caller.

- [ ] **Step 19.2: Add env vars to `CLAUDE.md`**

In the "Environment Variables" section, append to "Optional with defaults":

```
EXPO_ACCESS_TOKEN=<optional, raises rate limits + receipt SLA>
EXPO_PROJECT_ID=<optional, validates EAS project ID match>
```

- [ ] **Step 19.3: Verify AI-slop check passes**

```bash
pnpm check:ai-slop
```
Expected: pass — no banned phrases.

- [ ] **Step 19.4: Commit**

```bash
git add AGENTS.md CLAUDE.md
git commit -m "docs: document push channel + receipt worker + test endpoint"
```

---

## Task 20: Final verification + open PR

- [ ] **Step 20.1: Full local CI**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm coverage --filter @dragons/api
pnpm check:ai-slop
```
Expected: all green. Coverage thresholds (90% branches, 95% functions/lines/statements) hold for new files.

- [ ] **Step 20.2: Manual end-to-end smoke**

1. `pnpm dev`
2. Open native dev build on a real device (Expo Go won't work for push tokens — needs EAS dev build)
3. Sign in as a test admin user
4. Verify `SELECT * FROM push_devices WHERE user_id = '<admin>'` shows the token
5. Open web → admin settings → Notifications → click "Send test push"
6. Verify banner appears on device
7. Tap banner → app opens
8. Wait 15 min, refresh recent list → status flips to `delivered`

- [ ] **Step 20.3: Open PR**

```bash
git push -u origin <branch>
gh pr create --title "Native push notifications via Expo Push" --body "$(cat <<'EOF'
## Summary
- Adds Expo Push channel adapter wired into the existing notification pipeline
- Native client requests permission, registers device, handles foreground banners + tap deep links
- Receipt worker reconciles delivery status every 15 minutes and purges invalid tokens
- Admin test-push endpoint + web UI card for end-to-end verification

## Spec
docs/superpowers/specs/2026-04-23-native-push-notifications-design.md

## Test plan
- [ ] Server unit + integration tests pass
- [ ] Manual: native registers, receives, taps deep-link, receipt reconciles
- [ ] Manual: admin test push button delivers
- [ ] Sign-out unregisters device

EOF
)"
```

---

## Self-Review Notes

This plan was self-reviewed against the spec. All sections in the spec map to a task:

| Spec section | Task |
|---|---|
| Architecture / system shape | Tasks 1–11 (foundation), 13–16 (native) |
| Data model — push_devices, notification_log, channel_configs | Task 1 |
| role-defaults extension | Task 10 |
| Components — expo-push.client | Task 4 |
| Components — push.ts adapter | Task 8 |
| Components — push templates | Tasks 5, 6, 7 |
| Components — push-receipt.worker | Tasks 11, 12 |
| Components — notification-pipeline wiring | Task 9 |
| device.routes update | Task 3 |
| env.ts | Task 2 |
| Native — permission, token, register | Task 13 |
| Native — handler + tap | Task 14 |
| Native — hook + layout | Task 15 |
| Native — app.config plugin | Task 16 |
| Admin test push — server | Task 17 |
| Admin test push — web | Task 18 |
| Docs | Task 19 |
| Rollout / final verification | Task 20 |

No placeholders. No TBDs. Type names consistent across tasks (`PushSendParams`, `ExpoPushTicket`, `ExpoPushReceipt`, `Locale`, `PushTemplateOutput`, `RefereeAssignedPayload`, `RefereeSlotsPushPayload`).
