# Referee Notification System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically notify a WhatsApp group when home games need referees, with escalating reminders as the game approaches.

**Architecture:** Two new domain events (`referee.slots.needed`, `referee.slots.reminder`) flow through the existing notification pipeline. A new `referee-reminders` BullMQ queue handles delayed reminder jobs with lifecycle management (create/cancel/reschedule). A WAHA-based WhatsApp group channel adapter delivers messages.

**Tech Stack:** BullMQ (delayed jobs), WAHA (WhatsApp Web API, Docker), Hono, Drizzle ORM, Vitest

---

### Task 1: Add Domain Event Types and Payload

**Files:**
- Modify: `packages/shared/src/domain-events.ts`

- [ ] **Step 1: Add event type constants**

In `packages/shared/src/domain-events.ts`, add to the `EVENT_TYPES` object after the existing referee events:

```typescript
  // Referee slot events
  REFEREE_SLOTS_NEEDED: "referee.slots.needed",
  REFEREE_SLOTS_REMINDER: "referee.slots.reminder",
```

- [ ] **Step 2: Add the payload interface**

Below the existing `RefereeReassignedPayload`, add:

```typescript
export interface RefereeSlotsPayload {
  matchId: number;
  matchNo: number;
  homeTeam: string;
  guestTeam: string;
  leagueId: number;
  leagueName: string;
  kickoffDate: string;
  kickoffTime: string;
  venueId: number | null;
  venueName: string | null;
  sr1Open: boolean;
  sr2Open: boolean;
  sr1Assigned: string | null;
  sr2Assigned: string | null;
  reminderLevel?: number;
  deepLink: string;
}
```

- [ ] **Step 3: Add to the union type**

Add `RefereeSlotsPayload` to the `DomainEventPayload` union:

```typescript
export type DomainEventPayload =
  | MatchCreatedPayload
  // ... existing ...
  | RefereeReassignedPayload
  | RefereeSlotsPayload
  | BookingCreatedPayload
  // ... rest ...
```

- [ ] **Step 4: Verify types compile**

Run: `pnpm --filter @dragons/shared typecheck`
Expected: PASS (no type errors)

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/domain-events.ts
git commit -m "feat: add referee.slots.needed and referee.slots.reminder event types"
```

---

### Task 2: Add Urgency Classification for New Events

**Files:**
- Modify: `apps/api/src/services/events/event-types.ts`
- Test: `apps/api/src/services/events/event-types.test.ts`

- [ ] **Step 1: Write the failing test**

Create or extend `apps/api/src/services/events/event-types.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { classifyUrgency } from "./event-types";

describe("classifyUrgency - referee slot events", () => {
  it("classifies referee.slots.needed as immediate when kickoff within 7 days", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const result = classifyUrgency("referee.slots.needed", {
      kickoffDate: tomorrow.toISOString().split("T")[0],
    });
    expect(result).toBe("immediate");
  });

  it("classifies referee.slots.needed as routine when kickoff > 7 days away", () => {
    const farFuture = new Date();
    farFuture.setDate(farFuture.getDate() + 30);
    const result = classifyUrgency("referee.slots.needed", {
      kickoffDate: farFuture.toISOString().split("T")[0],
    });
    expect(result).toBe("routine");
  });

  it("classifies referee.slots.reminder as always immediate", () => {
    const result = classifyUrgency("referee.slots.reminder", {
      kickoffDate: "2099-12-31",
    });
    expect(result).toBe("immediate");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/api test -- apps/api/src/services/events/event-types.test.ts`
Expected: FAIL — `referee.slots.reminder` returns "routine" instead of "immediate"

- [ ] **Step 3: Implement urgency rules**

In `apps/api/src/services/events/event-types.ts`:

Add `EVENT_TYPES.REFEREE_SLOTS_REMINDER` to the `ALWAYS_IMMEDIATE` set:

```typescript
const ALWAYS_IMMEDIATE = new Set<string>([
  EVENT_TYPES.MATCH_CANCELLED,
  EVENT_TYPES.MATCH_FORFEITED,
  EVENT_TYPES.BOOKING_NEEDS_RECONFIRMATION,
  EVENT_TYPES.OVERRIDE_CONFLICT,
  EVENT_TYPES.REFEREE_SLOTS_REMINDER,
]);
```

Add `EVENT_TYPES.REFEREE_SLOTS_NEEDED` to the `DATE_DEPENDENT` set:

```typescript
const DATE_DEPENDENT = new Set<string>([
  EVENT_TYPES.MATCH_SCHEDULE_CHANGED,
  EVENT_TYPES.MATCH_VENUE_CHANGED,
  EVENT_TYPES.OVERRIDE_REVERTED,
  EVENT_TYPES.REFEREE_SLOTS_NEEDED,
]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dragons/api test -- apps/api/src/services/events/event-types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/events/event-types.ts apps/api/src/services/events/event-types.test.ts
git commit -m "feat: add urgency classification for referee slot events"
```

---

### Task 3: WhatsApp Group Message Templates

**Files:**
- Create: `apps/api/src/services/notifications/templates/referee-slots.ts`
- Test: `apps/api/src/services/notifications/templates/referee-slots.test.ts`

- [ ] **Step 1: Write the tests**

Create `apps/api/src/services/notifications/templates/referee-slots.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { renderRefereeSlotsWhatsApp } from "./referee-slots";
import type { RefereeSlotsPayload } from "@dragons/shared";

const basePayload: RefereeSlotsPayload = {
  matchId: 42,
  matchNo: 1001,
  homeTeam: "Dragons U16",
  guestTeam: "TSV Neustadt",
  leagueId: 5,
  leagueName: "Kreisliga U16",
  kickoffDate: "2026-03-15",
  kickoffTime: "14:00",
  venueId: 10,
  venueName: "Sporthalle Musterstraße",
  sr1Open: true,
  sr2Open: true,
  sr1Assigned: null,
  sr2Assigned: null,
  deepLink: "/referee/matches?take=42",
};

describe("renderRefereeSlotsWhatsApp", () => {
  it("renders initial notification with both slots open", () => {
    const result = renderRefereeSlotsWhatsApp(basePayload, "https://app.dragons.de");
    expect(result).toContain("*Schiedsrichter gesucht!*");
    expect(result).toContain("Dragons U16 vs. TSV Neustadt");
    expect(result).toContain("15.03.2026");
    expect(result).toContain("14:00");
    expect(result).toContain("Sporthalle Musterstraße");
    expect(result).toContain("Kreisliga U16");
    expect(result).toContain("SR1: ❌ offen");
    expect(result).toContain("SR2: ❌ offen");
    expect(result).toContain("https://app.dragons.de/referee/matches?take=42");
  });

  it("renders reminder with one slot filled", () => {
    const payload: RefereeSlotsPayload = {
      ...basePayload,
      sr1Open: false,
      sr1Assigned: "Max Mustermann",
      reminderLevel: 3,
    };
    const result = renderRefereeSlotsWhatsApp(payload, "https://app.dragons.de");
    expect(result).toContain("*Noch ein Schiedsrichter benötigt!*");
    expect(result).toContain("SR1: ✅ Max Mustermann");
    expect(result).toContain("SR2: ❌ *offen*");
    expect(result).toContain("Spieltag in 3 Tagen!");
  });

  it("renders reminder with both slots open", () => {
    const payload: RefereeSlotsPayload = {
      ...basePayload,
      reminderLevel: 7,
    };
    const result = renderRefereeSlotsWhatsApp(payload, "https://app.dragons.de");
    expect(result).toContain("*Noch Schiedsrichter benötigt!*");
    expect(result).toContain("Spieltag in 7 Tagen!");
  });

  it("renders reminder with 1 day as singular", () => {
    const payload: RefereeSlotsPayload = {
      ...basePayload,
      reminderLevel: 1,
    };
    const result = renderRefereeSlotsWhatsApp(payload, "https://app.dragons.de");
    expect(result).toContain("Spieltag morgen!");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/api test -- apps/api/src/services/notifications/templates/referee-slots.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the template**

Create `apps/api/src/services/notifications/templates/referee-slots.ts`:

```typescript
import type { RefereeSlotsPayload } from "@dragons/shared";

/**
 * Format a YYYY-MM-DD date string as DD.MM.YYYY.
 */
function formatDateFull(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${day}.${month}.${year}`;
}

/**
 * Format a date string to a short German weekday (Mo, Di, Mi, Do, Fr, Sa, So).
 */
function weekdayShort(dateStr: string): string {
  const days = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const d = new Date(dateStr + "T12:00:00");
  return days[d.getDay()]!;
}

function renderSlotLine(slotNum: number, isOpen: boolean, assigned: string | null, isReminder: boolean): string {
  if (!isOpen && assigned) {
    return `SR${slotNum}: ✅ ${assigned}`;
  }
  return isReminder ? `SR${slotNum}: ❌ *offen*` : `SR${slotNum}: ❌ offen`;
}

function renderCountdown(days: number): string {
  if (days === 1) return "Spieltag morgen!";
  return `Spieltag in ${days} Tagen!`;
}

/**
 * Render a WhatsApp-formatted message for referee slot notifications.
 * Pure function: payload in, string out.
 */
export function renderRefereeSlotsWhatsApp(
  payload: RefereeSlotsPayload,
  baseUrl: string,
): string {
  const isReminder = payload.reminderLevel != null;
  const bothOpen = payload.sr1Open && payload.sr2Open;
  const oneOpen = (payload.sr1Open || payload.sr2Open) && !bothOpen;

  // Title
  let title: string;
  if (isReminder) {
    title = oneOpen
      ? "⚠️ *Noch ein Schiedsrichter benötigt!*"
      : "⚠️ *Noch Schiedsrichter benötigt!*";
  } else {
    title = "🏀 *Schiedsrichter gesucht!*";
  }

  // Match info
  const wd = weekdayShort(payload.kickoffDate);
  const dateFmt = formatDateFull(payload.kickoffDate);
  const lines = [
    title,
    "",
    `${payload.homeTeam} vs. ${payload.guestTeam}`,
    `📅 ${wd}, ${dateFmt} um ${payload.kickoffTime}`,
    `📍 ${payload.venueName ?? "Ort unbekannt"}`,
  ];

  // League name only on initial notification
  if (!isReminder) {
    lines.push(`🏟️ ${payload.leagueName}`);
  }

  lines.push("");

  // Slot lines
  if (payload.sr1Open || payload.sr1Assigned) {
    lines.push(renderSlotLine(1, payload.sr1Open, payload.sr1Assigned, isReminder));
  }
  if (payload.sr2Open || payload.sr2Assigned) {
    lines.push(renderSlotLine(2, payload.sr2Open, payload.sr2Assigned, isReminder));
  }

  // Countdown for reminders
  if (isReminder && payload.reminderLevel != null) {
    lines.push("");
    lines.push(renderCountdown(payload.reminderLevel));
  }

  // Deep link
  lines.push(`👉 ${isReminder ? "" : "Spiel übernehmen: "}${baseUrl}${payload.deepLink}`);

  return lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dragons/api test -- apps/api/src/services/notifications/templates/referee-slots.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/notifications/templates/referee-slots.ts apps/api/src/services/notifications/templates/referee-slots.test.ts
git commit -m "feat: add WhatsApp message templates for referee slot notifications"
```

---

### Task 4: WhatsApp Group Channel Adapter

**Files:**
- Create: `apps/api/src/services/notifications/channels/whatsapp-group.ts`
- Test: `apps/api/src/services/notifications/channels/whatsapp-group.test.ts`
- Modify: `apps/api/src/config/env.ts`

- [ ] **Step 1: Add WAHA env vars**

In `apps/api/src/config/env.ts`, add to the `envSchema`:

```typescript
  // WAHA (WhatsApp HTTP API)
  WAHA_BASE_URL: z.string().url().optional(),
  WAHA_SESSION: z.string().default("default"),
```

- [ ] **Step 2: Write the tests**

Create `apps/api/src/services/notifications/channels/whatsapp-group.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WhatsAppGroupAdapter } from "./whatsapp-group";
import type { ChannelSendParams } from "./types";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("WhatsAppGroupAdapter", () => {
  const adapter = new WhatsAppGroupAdapter();

  const baseParams: ChannelSendParams = {
    eventId: "test-event-1",
    watchRuleId: null,
    channelConfigId: 1,
    recipientId: null,
    title: "Test Title",
    body: "Test body message",
    locale: "de",
  };

  const channelConfig = {
    wahaBaseUrl: "http://waha:3000",
    wahaSession: "default",
    groupChatId: "120363171744447809@g.us",
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("sends text message to WAHA API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "msg-1" }),
    });

    const result = await adapter.send(baseParams, channelConfig);

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://waha:3000/api/sendText",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: "default",
          chatId: "120363171744447809@g.us",
          text: "Test body message",
        }),
      }),
    );
  });

  it("returns error when WAHA responds with non-ok status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });

    const result = await adapter.send(baseParams, channelConfig);

    expect(result.success).toBe(false);
    expect(result.error).toContain("500");
  });

  it("returns error when fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

    const result = await adapter.send(baseParams, channelConfig);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Connection refused");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @dragons/api test -- apps/api/src/services/notifications/channels/whatsapp-group.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement the adapter**

Create `apps/api/src/services/notifications/channels/whatsapp-group.ts`:

```typescript
import type { ChannelAdapter, ChannelSendParams, DeliveryResult } from "./types";
import { logger } from "../../../config/logger";

const log = logger.child({ service: "whatsapp-group-adapter" });

export interface WhatsAppGroupConfig {
  wahaBaseUrl: string;
  wahaSession: string;
  groupChatId: string;
}

export class WhatsAppGroupAdapter implements ChannelAdapter {
  async send(params: ChannelSendParams, channelConfig?: WhatsAppGroupConfig): Promise<DeliveryResult> {
    if (!channelConfig) {
      return { success: false, error: "Missing WhatsApp group channel config" };
    }

    const { wahaBaseUrl, wahaSession, groupChatId } = channelConfig;

    try {
      const response = await fetch(`${wahaBaseUrl}/api/sendText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: wahaSession,
          chatId: groupChatId,
          text: params.body,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.error(
          { status: response.status, errorText, groupChatId },
          "WAHA sendText failed",
        );
        return { success: false, error: `WAHA error ${response.status}: ${errorText}` };
      }

      log.info({ groupChatId, eventId: params.eventId }, "WhatsApp group message sent");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      log.error({ err, groupChatId }, "Failed to send WhatsApp group message");
      return { success: false, error: message };
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @dragons/api test -- apps/api/src/services/notifications/channels/whatsapp-group.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/config/env.ts apps/api/src/services/notifications/channels/whatsapp-group.ts apps/api/src/services/notifications/channels/whatsapp-group.test.ts
git commit -m "feat: add WhatsApp group channel adapter using WAHA API"
```

---

### Task 5: Wire WhatsApp Adapter into Notification Pipeline

**Files:**
- Modify: `apps/api/src/services/notifications/notification-pipeline.ts`
- Modify: `apps/api/src/services/notifications/role-defaults.ts`
- Modify: `apps/api/src/services/notifications/templates/index.ts`

- [ ] **Step 1: Add referee slot events to role defaults**

In `apps/api/src/services/notifications/role-defaults.ts`, add a new section after the referee reassigned block (before the `return results` line):

```typescript
  // Referee slot events → WhatsApp group (no individual recipient)
  if (eventType === "referee.slots.needed" || eventType === "referee.slots.reminder") {
    results.push({ audience: "admin", channel: "in_app" });
  }
```

This ensures admins get an in-app notification for slot events. The WhatsApp group delivery happens via watch rules (configured in DB), not role defaults — since the group is not an individual recipient.

- [ ] **Step 2: Register referee slot template renderer in template index**

In `apps/api/src/services/notifications/templates/index.ts`, add the import and wire it into the router:

```typescript
import { renderRefereeSlotsMessage } from "./referee-slots";
```

Wait — the existing template system returns `{ title, body }` for in-app notifications, but the WhatsApp adapter needs the full formatted WhatsApp message from `renderRefereeSlotsWhatsApp`. The pipeline currently calls `renderEventMessage()` which returns `{ title, body }`.

For WhatsApp group delivery, the template rendering happens in the adapter itself (it receives the event payload and renders the WhatsApp-specific format). The in-app template system needs a short renderer for `referee.slots.needed` and `referee.slots.reminder`.

Add a renderer to `apps/api/src/services/notifications/templates/referee.ts` for the new event types. Add to the `refereeRenderers` record:

```typescript
  [EVENT_TYPES.REFEREE_SLOTS_NEEDED]: (payload, _entityName, locale) => {
    const home = String(payload.homeTeam ?? "");
    const guest = String(payload.guestTeam ?? "");
    const match = `${home} vs ${guest}`;

    return locale === "de"
      ? {
          title: "🏀 Schiedsrichter gesucht",
          body: `${match} braucht noch Schiedsrichter.`,
        }
      : {
          title: "🏀 Referees needed",
          body: `${match} still needs referees.`,
        };
  },

  [EVENT_TYPES.REFEREE_SLOTS_REMINDER]: (payload, _entityName, locale) => {
    const home = String(payload.homeTeam ?? "");
    const guest = String(payload.guestTeam ?? "");
    const match = `${home} vs ${guest}`;
    const days = Number(payload.reminderLevel ?? 0);

    return locale === "de"
      ? {
          title: `⚠️ Erinnerung: Schiedsrichter benötigt`,
          body: `${match} in ${days} Tagen braucht noch Schiedsrichter.`,
        }
      : {
          title: `⚠️ Reminder: Referees needed`,
          body: `${match} in ${days} days still needs referees.`,
        };
  },
```

Also add `REFEREE_SLOTS_NEEDED` and `REFEREE_SLOTS_REMINDER` to the `REFEREE_SELF_EVENTS` set? No — those are for individual referee notifications. The slot events are group-level.

- [ ] **Step 3: Wire WhatsApp adapter into pipeline dispatch**

In `apps/api/src/services/notifications/notification-pipeline.ts`, add the WhatsApp group adapter. Import at the top:

```typescript
import { WhatsAppGroupAdapter } from "./channels/whatsapp-group";
import type { WhatsAppGroupConfig } from "./channels/whatsapp-group";
import { renderRefereeSlotsWhatsApp } from "./templates/referee-slots";
import type { RefereeSlotsPayload } from "@dragons/shared";
```

Add adapter instance next to the existing `inAppAdapter`:

```typescript
const whatsAppGroupAdapter = new WhatsAppGroupAdapter();
```

In the `dispatchImmediate` function, add a `whatsapp_group` case after the `in_app` case:

```typescript
  if (channelType === "whatsapp_group") {
    const configData = config.config as unknown as WhatsAppGroupConfig;
    // For referee slot events, use the WhatsApp-specific template
    const isSlotEvent =
      event.type === "referee.slots.needed" || event.type === "referee.slots.reminder";

    let text: string;
    if (isSlotEvent) {
      const baseUrl = configData.wahaBaseUrl ? "" : "";
      // Use TRUSTED_ORIGINS first entry as public base URL, or fallback
      const publicUrl = (process.env.TRUSTED_ORIGINS ?? "http://localhost:3000").split(",")[0]!.trim();
      text = renderRefereeSlotsWhatsApp(payload as unknown as RefereeSlotsPayload, publicUrl);
    } else {
      text = `*${message.title}*\n\n${message.body}`;
    }

    const result = await whatsAppGroupAdapter.send(
      { ...params, body: text },
      configData,
    );
    return result.success;
  }
```

Note: `params` here refers to the `ChannelSendParams` already constructed in the function — we override `body` with the WhatsApp-formatted text.

Wait — `dispatchImmediate` doesn't currently pass channel config data to adapters. The `InAppChannelAdapter.send()` doesn't need it, but `WhatsAppGroupAdapter.send()` does. Let me adjust the approach.

Revise `dispatchImmediate` to pass the config data:

In the function signature, `config` already has type `{ id: number; type: string; config: unknown }`. The `config.config` field holds the channel-specific configuration. Update the `whatsapp_group` branch:

```typescript
  if (channelType === "whatsapp_group") {
    const channelCfg = config.config as unknown as WhatsAppGroupConfig;
    const publicUrl = (process.env.TRUSTED_ORIGINS ?? "http://localhost:3000").split(",")[0]!.trim();

    const isSlotEvent =
      event.type === "referee.slots.needed" || event.type === "referee.slots.reminder";
    const text = isSlotEvent
      ? renderRefereeSlotsWhatsApp(payload as unknown as RefereeSlotsPayload, publicUrl)
      : `*${message.title}*\n\n${message.body}`;

    const sendResult = await whatsAppGroupAdapter.send(
      { eventId: event.id, watchRuleId, channelConfigId: config.id, recipientId, title: message.title, body: text, locale },
      channelCfg,
    );
    return sendResult.success;
  }
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm --filter @dragons/api typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/notifications/notification-pipeline.ts apps/api/src/services/notifications/role-defaults.ts apps/api/src/services/notifications/templates/referee.ts
git commit -m "feat: wire WhatsApp group adapter into notification pipeline"
```

---

### Task 6: Referee Reminders Service (Job Scheduling)

**Files:**
- Create: `apps/api/src/services/referee/referee-reminders.service.ts`
- Test: `apps/api/src/services/referee/referee-reminders.service.test.ts`

- [ ] **Step 1: Write the tests**

Create `apps/api/src/services/referee/referee-reminders.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeReminderDelays,
  buildReminderJobId,
} from "./referee-reminders.service";

describe("computeReminderDelays", () => {
  it("computes correct delays for future reminders", () => {
    // kickoff in 10 days
    const now = new Date("2026-03-01T04:00:00Z");
    const kickoffDate = "2026-03-11";
    const kickoffTime = "14:00";
    const reminderDays = [7, 3, 1];

    const delays = computeReminderDelays(kickoffDate, kickoffTime, reminderDays, now);

    expect(delays).toHaveLength(3);
    // 7 days before = March 4 14:00 → ~3.4 days from now
    expect(delays[0]!.days).toBe(7);
    expect(delays[0]!.delayMs).toBeGreaterThan(0);
    // 3 days before = March 8 14:00
    expect(delays[1]!.days).toBe(3);
    expect(delays[1]!.delayMs).toBeGreaterThan(delays[0]!.delayMs);
    // 1 day before = March 10 14:00
    expect(delays[2]!.days).toBe(1);
    expect(delays[2]!.delayMs).toBeGreaterThan(delays[1]!.delayMs);
  });

  it("skips reminders that are already in the past", () => {
    // kickoff in 2 days
    const now = new Date("2026-03-09T04:00:00Z");
    const kickoffDate = "2026-03-11";
    const kickoffTime = "14:00";
    const reminderDays = [7, 3, 1];

    const delays = computeReminderDelays(kickoffDate, kickoffTime, reminderDays, now);

    // Only 1-day reminder is in the future
    expect(delays).toHaveLength(1);
    expect(delays[0]!.days).toBe(1);
  });

  it("returns empty for past kickoff", () => {
    const now = new Date("2026-03-15T04:00:00Z");
    const kickoffDate = "2026-03-11";
    const kickoffTime = "14:00";
    const reminderDays = [7, 3, 1];

    const delays = computeReminderDelays(kickoffDate, kickoffTime, reminderDays, now);

    expect(delays).toHaveLength(0);
  });
});

describe("buildReminderJobId", () => {
  it("builds deterministic job ID", () => {
    expect(buildReminderJobId(42, 7)).toBe("reminder:42:7");
    expect(buildReminderJobId(100, 1)).toBe("reminder:100:1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/api test -- apps/api/src/services/referee/referee-reminders.service.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the service**

Create `apps/api/src/services/referee/referee-reminders.service.ts`:

```typescript
import { db } from "../../config/database";
import { appSettings } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../../config/logger";

const log = logger.child({ service: "referee-reminders" });

const DEFAULT_REMINDER_DAYS = [7, 3, 1];
const SETTINGS_KEY = "referee_reminder_days";

export interface ReminderDelay {
  days: number;
  delayMs: number;
}

/**
 * Build a deterministic BullMQ job ID for deduplication.
 */
export function buildReminderJobId(matchId: number, days: number): string {
  return `reminder:${matchId}:${days}`;
}

/**
 * Parse a kickoff date + time into a Date in Europe/Berlin timezone.
 */
function parseKickoff(kickoffDate: string, kickoffTime: string): Date {
  // Build an ISO string and parse — kickoff times are in Europe/Berlin
  return new Date(`${kickoffDate}T${kickoffTime}:00+02:00`);
}

/**
 * Compute which reminders to schedule and their delays from now.
 * Returns only reminders that are still in the future.
 */
export function computeReminderDelays(
  kickoffDate: string,
  kickoffTime: string,
  reminderDays: number[],
  now: Date = new Date(),
): ReminderDelay[] {
  const kickoff = parseKickoff(kickoffDate, kickoffTime);
  const delays: ReminderDelay[] = [];

  for (const days of reminderDays) {
    const reminderTime = new Date(kickoff.getTime() - days * 24 * 60 * 60 * 1000);
    const delayMs = reminderTime.getTime() - now.getTime();

    if (delayMs > 0) {
      delays.push({ days, delayMs });
    }
  }

  return delays;
}

/**
 * Read the configured reminder days from appSettings.
 * Falls back to [7, 3, 1] if not configured.
 */
export async function getReminderDays(): Promise<number[]> {
  try {
    const [row] = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, SETTINGS_KEY))
      .limit(1);

    if (row?.value) {
      const parsed = JSON.parse(row.value) as unknown;
      if (Array.isArray(parsed) && parsed.every((n) => typeof n === "number" && n > 0)) {
        return parsed.sort((a, b) => b - a); // descending: [7, 3, 1]
      }
    }
  } catch (err) {
    log.warn({ err }, "Failed to read referee_reminder_days, using defaults");
  }

  return DEFAULT_REMINDER_DAYS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dragons/api test -- apps/api/src/services/referee/referee-reminders.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/referee/referee-reminders.service.ts apps/api/src/services/referee/referee-reminders.service.test.ts
git commit -m "feat: add referee reminders service with delay computation"
```

---

### Task 7: Referee Reminders Queue and Worker

**Files:**
- Modify: `apps/api/src/workers/queues.ts`
- Create: `apps/api/src/workers/referee-reminder.worker.ts`
- Test: `apps/api/src/workers/referee-reminder.worker.test.ts`
- Modify: `apps/api/src/workers/index.ts`

- [ ] **Step 1: Add the queue definition**

In `apps/api/src/workers/queues.ts`, add after the `syncQueue` definition:

```typescript
export const refereeRemindersQueue = new Queue("referee-reminders", {
  prefix: "{bull}",
  connection: { url: env.REDIS_URL },
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 500 },
  },
});
```

- [ ] **Step 2: Write the worker test**

Create `apps/api/src/workers/referee-reminder.worker.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { shouldEmitReminder } from "./referee-reminder.worker";

describe("shouldEmitReminder", () => {
  it("returns true when both slots are unfilled", () => {
    expect(shouldEmitReminder({
      isCancelled: false,
      isForfeited: false,
      sr1Assigned: null,
      sr2Assigned: null,
    })).toBe(true);
  });

  it("returns true when one slot is unfilled", () => {
    expect(shouldEmitReminder({
      isCancelled: false,
      isForfeited: false,
      sr1Assigned: "Max",
      sr2Assigned: null,
    })).toBe(true);
  });

  it("returns false when both slots are filled", () => {
    expect(shouldEmitReminder({
      isCancelled: false,
      isForfeited: false,
      sr1Assigned: "Max",
      sr2Assigned: "Erika",
    })).toBe(false);
  });

  it("returns false when match is cancelled", () => {
    expect(shouldEmitReminder({
      isCancelled: true,
      isForfeited: false,
      sr1Assigned: null,
      sr2Assigned: null,
    })).toBe(false);
  });

  it("returns false when match is forfeited", () => {
    expect(shouldEmitReminder({
      isCancelled: false,
      isForfeited: true,
      sr1Assigned: null,
      sr2Assigned: null,
    })).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @dragons/api test -- apps/api/src/workers/referee-reminder.worker.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement the worker**

Create `apps/api/src/workers/referee-reminder.worker.ts`:

```typescript
import { Worker, type Job } from "bullmq";
import { eq, and, isNotNull } from "drizzle-orm";
import { db } from "../config/database";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { matches, teams, leagues, matchReferees, referees, venues } from "@dragons/db/schema";
import { publishDomainEvent } from "../services/events/event-publisher";
import { EVENT_TYPES, type RefereeSlotsPayload } from "@dragons/shared";

const log = logger.child({ service: "referee-reminder-worker" });

export interface ReminderJobData {
  matchId: number;
  reminderDays: number;
}

interface MatchSlotState {
  isCancelled: boolean;
  isForfeited: boolean;
  sr1Assigned: string | null;
  sr2Assigned: string | null;
}

/**
 * Determine whether a reminder notification should be emitted.
 * Exported for testing.
 */
export function shouldEmitReminder(state: MatchSlotState): boolean {
  if (state.isCancelled || state.isForfeited) return false;
  // Both assigned → no reminder needed
  if (state.sr1Assigned && state.sr2Assigned) return false;
  return true;
}

/**
 * Load match with current slot assignments from DB.
 */
async function loadMatchWithSlots(matchId: number) {
  const homeTeam = teams.as("home_team");
  const guestTeam = teams.as("guest_team");

  const [row] = await db
    .select({
      id: matches.id,
      apiMatchId: matches.apiMatchId,
      matchNo: matches.matchNo,
      kickoffDate: matches.kickoffDate,
      kickoffTime: matches.kickoffTime,
      isCancelled: matches.isCancelled,
      isForfeited: matches.isForfeited,
      sr1Open: matches.sr1Open,
      sr2Open: matches.sr2Open,
      leagueId: matches.leagueId,
      leagueName: leagues.name,
      homeTeamName: homeTeam.name,
      guestTeamName: guestTeam.name,
      venueName: venues.name,
      venueId: matches.venueId,
    })
    .from(matches)
    .innerJoin(homeTeam, eq(matches.homeTeamApiId, homeTeam.apiTeamPermanentId))
    .innerJoin(guestTeam, eq(matches.guestTeamApiId, guestTeam.apiTeamPermanentId))
    .innerJoin(leagues, eq(matches.leagueId, leagues.id))
    .leftJoin(venues, eq(matches.venueId, venues.id))
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!row) return null;

  // Load current referee assignments for sr1 (slotNumber=1) and sr2 (slotNumber=2)
  const assignments = await db
    .select({
      slotNumber: matchReferees.slotNumber,
      firstName: referees.firstName,
      lastName: referees.lastName,
    })
    .from(matchReferees)
    .innerJoin(referees, eq(matchReferees.refereeId, referees.id))
    .where(eq(matchReferees.matchId, matchId));

  const sr1Ref = assignments.find((a) => a.slotNumber === 1);
  const sr2Ref = assignments.find((a) => a.slotNumber === 2);

  return {
    ...row,
    sr1Assigned: sr1Ref ? `${sr1Ref.firstName} ${sr1Ref.lastName}` : null,
    sr2Assigned: sr2Ref ? `${sr2Ref.firstName} ${sr2Ref.lastName}` : null,
  };
}

export const refereeReminderWorker = new Worker<ReminderJobData>(
  "referee-reminders",
  async (job: Job<ReminderJobData>) => {
    const { matchId, reminderDays } = job.data;
    const jobLog = log.child({ jobId: job.id, matchId, reminderDays });

    jobLog.info("Processing referee reminder");

    const match = await loadMatchWithSlots(matchId);
    if (!match) {
      jobLog.warn("Match not found, skipping reminder");
      return { skipped: true, reason: "match_not_found" };
    }

    if (!shouldEmitReminder({
      isCancelled: match.isCancelled,
      isForfeited: match.isForfeited,
      sr1Assigned: match.sr1Assigned,
      sr2Assigned: match.sr2Assigned,
    })) {
      jobLog.info("Slots filled or match cancelled, skipping reminder");
      return { skipped: true, reason: "not_needed" };
    }

    const payload: RefereeSlotsPayload = {
      matchId: match.id,
      matchNo: match.matchNo,
      homeTeam: match.homeTeamName,
      guestTeam: match.guestTeamName,
      leagueId: match.leagueId!,
      leagueName: match.leagueName,
      kickoffDate: match.kickoffDate,
      kickoffTime: match.kickoffTime,
      venueId: match.venueId,
      venueName: match.venueName,
      sr1Open: !match.sr1Assigned,
      sr2Open: !match.sr2Assigned,
      sr1Assigned: match.sr1Assigned,
      sr2Assigned: match.sr2Assigned,
      reminderLevel: reminderDays,
      deepLink: `/referee/matches?take=${match.id}`,
    };

    await publishDomainEvent({
      type: EVENT_TYPES.REFEREE_SLOTS_REMINDER,
      source: "sync",
      entityType: "match",
      entityId: match.id,
      entityName: `${match.homeTeamName} vs ${match.guestTeamName}`,
      deepLinkPath: `/referee/matches?take=${match.id}`,
      payload: payload as unknown as Record<string, unknown>,
    });

    jobLog.info("Referee slots reminder event published");
    return { emitted: true };
  },
  {
    prefix: "{bull}",
    connection: { url: env.REDIS_URL },
    concurrency: 3,
  },
);

/* v8 ignore next 3 */
refereeReminderWorker.on("failed", (job, err) => {
  log.error({ jobId: job?.id, err }, "Referee reminder job failed");
});
```

- [ ] **Step 5: Register worker in index**

In `apps/api/src/workers/index.ts`, add the import and wire into shutdown:

Add import at the top:
```typescript
import { refereeReminderWorker } from "./referee-reminder.worker";
import { refereeRemindersQueue } from "./queues";
```

In `initializeWorkers()`, add after existing worker logs:
```typescript
  logger.info("Referee reminder worker started");
```

In `shutdownWorkers()`, add before existing closes:
```typescript
  await refereeReminderWorker.close();
  await refereeRemindersQueue.close();
```

Add to the exports:
```typescript
export { refereeReminderWorker };
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @dragons/api test -- apps/api/src/workers/referee-reminder.worker.test.ts`
Expected: PASS

- [ ] **Step 7: Run typecheck**

Run: `pnpm --filter @dragons/api typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/workers/queues.ts apps/api/src/workers/referee-reminder.worker.ts apps/api/src/workers/referee-reminder.worker.test.ts apps/api/src/workers/index.ts
git commit -m "feat: add referee reminders queue and worker"
```

---

### Task 8: Emit Events and Schedule Reminders in Match Sync

**Files:**
- Modify: `apps/api/src/services/sync/matches.sync.ts`
- Test: integration tested via existing sync tests + new dedicated tests

This is the core integration task. The match sync needs to:
1. Emit `referee.slots.needed` when a qualifying new match is created
2. Emit `referee.slots.needed` when `sr1Open`/`sr2Open` flips `false→true`
3. Schedule reminder jobs for own-club home games
4. Cancel/reschedule reminders on date change, cancellation, or forfeiture

- [ ] **Step 1: Add imports to matches.sync.ts**

At the top of `apps/api/src/services/sync/matches.sync.ts`, add:

```typescript
import { teams, leagues } from "@dragons/db/schema";
import {
  scheduleReminderJobs,
  cancelReminderJobs,
} from "../referee/referee-reminders.service";
```

- [ ] **Step 2: Add helper to check if match qualifies for referee notifications**

Add this function before `syncMatchesFromData`:

```typescript
interface RefereeNotificationContext {
  isOwnClubHome: boolean;
  isOwnClubRefsLeague: boolean;
}

async function getRefereeNotificationContext(
  homeTeamApiId: number,
  leagueDbId: number | null,
): Promise<RefereeNotificationContext> {
  if (!leagueDbId) return { isOwnClubHome: false, isOwnClubRefsLeague: false };

  const homeTeam = teams.as("home_check");
  const [row] = await db
    .select({
      isOwnClub: homeTeam.isOwnClub,
      ownClubRefs: leagues.ownClubRefs,
    })
    .from(homeTeam)
    .innerJoin(leagues, eq(leagues.id, leagueDbId))
    .where(eq(homeTeam.apiTeamPermanentId, homeTeamApiId))
    .limit(1);

  return {
    isOwnClubHome: row?.isOwnClub ?? false,
    isOwnClubRefsLeague: row?.ownClubRefs ?? false,
  };
}
```

- [ ] **Step 3: The `scheduleReminderJobs` and `cancelReminderJobs` functions**

These are defined in `apps/api/src/services/referee/referee-reminders.service.ts` (Task 6). Add them to that file now — they were deferred from Task 6 because they depend on the queue from Task 7.

Add to `apps/api/src/services/referee/referee-reminders.service.ts`:

```typescript
import { refereeRemindersQueue } from "../../workers/queues";

/**
 * Schedule delayed reminder jobs for a match.
 * Uses deterministic job IDs for dedup.
 */
export async function scheduleReminderJobs(
  matchId: number,
  kickoffDate: string,
  kickoffTime: string,
): Promise<void> {
  const reminderDays = await getReminderDays();
  const delays = computeReminderDelays(kickoffDate, kickoffTime, reminderDays);

  for (const { days, delayMs } of delays) {
    await refereeRemindersQueue.add(
      "referee-reminder",
      { matchId, reminderDays: days },
      {
        delay: delayMs,
        jobId: buildReminderJobId(matchId, days),
      },
    );
  }

  if (delays.length > 0) {
    log.info({ matchId, reminders: delays.map((d) => d.days) }, "Scheduled referee reminder jobs");
  }
}

/**
 * Cancel all pending reminder jobs for a match.
 */
export async function cancelReminderJobs(matchId: number): Promise<void> {
  const reminderDays = await getReminderDays();
  for (const days of reminderDays) {
    const jobId = buildReminderJobId(matchId, days);
    const job = await refereeRemindersQueue.getJob(jobId);
    if (job) {
      await job.remove();
    }
  }
  log.info({ matchId }, "Cancelled referee reminder jobs");
}
```

- [ ] **Step 5: Emit event and schedule jobs on new match creation**

In the new-match creation block (after the existing `publishDomainEvent` for `MATCH_CREATED` around line 947), add:

```typescript
          // Check if this is an own-club home game needing referee notifications
          if (newMatch) {
            try {
              const refCtx = await getRefereeNotificationContext(
                remoteSnapshot.homeTeamApiId,
                data.leagueDbId,
              );

              if (refCtx.isOwnClubHome && refCtx.isOwnClubRefsLeague) {
                // Emit referee.slots.needed
                await publishDomainEvent({
                  type: EVENT_TYPES.REFEREE_SLOTS_NEEDED,
                  source: "sync",
                  entityType: "match",
                  entityId: newMatch.id,
                  entityName,
                  deepLinkPath: `/referee/matches?take=${newMatch.id}`,
                  payload: {
                    matchId: newMatch.id,
                    matchNo: basicMatch.matchNo,
                    homeTeam: basicMatch.homeTeam?.teamname ?? "Unknown",
                    guestTeam: basicMatch.guestTeam?.teamname ?? "Unknown",
                    leagueId: data.leagueDbId,
                    leagueName: data.leagueName ?? "",
                    kickoffDate: remoteSnapshot.kickoffDate,
                    kickoffTime: remoteSnapshot.kickoffTime,
                    venueId: internalVenueId,
                    venueName: null,
                    sr1Open: true,
                    sr2Open: true,
                    sr1Assigned: null,
                    sr2Assigned: null,
                    deepLink: `/referee/matches?take=${newMatch.id}`,
                  },
                  syncRunId,
                });

                // Schedule reminder jobs
                await scheduleReminderJobs(newMatch.id, remoteSnapshot.kickoffDate, remoteSnapshot.kickoffTime);
              }
            } catch (error) {
              log.warn({ err: error, matchId: newMatch.id }, "Failed to emit referee.slots.needed or schedule reminders");
            }
          }
```

- [ ] **Step 6: Handle sr*Open flip and schedule/cancellation changes on match update**

In the match update event emission block (after the `for (const eventType of matchEventTypes)` loop, around line 845), add:

```typescript
            // Referee notification triggers on update
            try {
              const refCtx = await getRefereeNotificationContext(
                remoteSnapshot.homeTeamApiId,
                data.leagueDbId,
              );

              if (refCtx.isOwnClubHome) {
                const changedFields = new Set(effectiveChanges.map((c) => c.fieldName));

                // sr1Open or sr2Open flipped to true → emit referee.slots.needed
                const sr1Flipped = changedFields.has("sr1Open") &&
                  effectiveChanges.find((c) => c.fieldName === "sr1Open")?.newValue === "true";
                const sr2Flipped = changedFields.has("sr2Open") &&
                  effectiveChanges.find((c) => c.fieldName === "sr2Open")?.newValue === "true";

                if (sr1Flipped || sr2Flipped) {
                  await publishDomainEvent({
                    type: EVENT_TYPES.REFEREE_SLOTS_NEEDED,
                    source: "sync",
                    entityType: "match",
                    entityId: existing.id,
                    entityName,
                    deepLinkPath: `/referee/matches?take=${existing.id}`,
                    payload: {
                      matchId: existing.id,
                      matchNo: basicMatch.matchNo,
                      homeTeam: basicMatch.homeTeam?.teamname ?? "Unknown",
                      guestTeam: basicMatch.guestTeam?.teamname ?? "Unknown",
                      leagueId: data.leagueDbId,
                      leagueName: data.leagueName ?? "",
                      kickoffDate: remoteSnapshot.kickoffDate,
                      kickoffTime: remoteSnapshot.kickoffTime,
                      venueId: internalVenueId,
                      venueName: null,
                      sr1Open: remoteSnapshot.sr1Open,
                      sr2Open: remoteSnapshot.sr2Open,
                      sr1Assigned: null,
                      sr2Assigned: null,
                      deepLink: `/referee/matches?take=${existing.id}`,
                    },
                    syncRunId,
                  });
                }

                // Schedule changes, cancellation, forfeiture → manage reminder jobs
                if (refCtx.isOwnClubRefsLeague) {
                  const cancelled = changedFields.has("isCancelled") &&
                    effectiveChanges.find((c) => c.fieldName === "isCancelled")?.newValue === "true";
                  const forfeited = changedFields.has("isForfeited") &&
                    effectiveChanges.find((c) => c.fieldName === "isForfeited")?.newValue === "true";

                  if (cancelled || forfeited) {
                    await cancelReminderJobs(existing.id);
                  } else if (changedFields.has("kickoffDate") || changedFields.has("kickoffTime")) {
                    // Reschedule: cancel old, create new
                    await cancelReminderJobs(existing.id);
                    await scheduleReminderJobs(existing.id, remoteSnapshot.kickoffDate, remoteSnapshot.kickoffTime);
                  }
                }
              }
            } catch (error) {
              log.warn({ err: error, matchId: existing.id }, "Failed to handle referee notification triggers on update");
            }
```

- [ ] **Step 7: Run typecheck**

Run: `pnpm --filter @dragons/api typecheck`
Expected: PASS

- [ ] **Step 8: Run existing tests**

Run: `pnpm --filter @dragons/api test`
Expected: All existing tests PASS

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/services/sync/matches.sync.ts
git commit -m "feat: emit referee.slots.needed events and schedule reminders in match sync"
```

---

### Task 9: Cancel Reminders When Slots Fill During Referee Sync

**Files:**
- Modify: `apps/api/src/services/sync/referees.sync.ts`

- [ ] **Step 1: Read the current referees.sync.ts to find where assignments are confirmed**

The `syncRefereeAssignmentsFromData` function processes new/changed assignments. After creating an assignment, we need to check if both slots for that match are now filled.

- [ ] **Step 2: Add import**

At the top of `apps/api/src/services/sync/referees.sync.ts`, add:

```typescript
import { refereeRemindersQueue } from "../../workers/queues";
import { buildReminderJobId, getReminderDays } from "../referee/referee-reminders.service";
```

- [ ] **Step 3: Add slot-check-and-cancel logic**

After the assignment upsert loop in `syncRefereeAssignmentsFromData`, add a check for fully-filled matches. Find the section where assignments are created/updated (after the `result.created++` line), and add:

```typescript
        // Check if both slots are now filled → cancel reminders
        try {
          const slotsForMatch = await db
            .select({ slotNumber: matchReferees.slotNumber })
            .from(matchReferees)
            .where(eq(matchReferees.matchId, dbMatchId));

          const filledSlots = new Set(slotsForMatch.map((s) => s.slotNumber));
          if (filledSlots.has(1) && filledSlots.has(2)) {
            const reminderDays = await getReminderDays();
            for (const days of reminderDays) {
              const jobId = buildReminderJobId(dbMatchId, days);
              const job = await refereeRemindersQueue.getJob(jobId);
              if (job) await job.remove();
            }
            log.info({ matchId: dbMatchId }, "Both referee slots filled, cancelled reminder jobs");
          }
        } catch (error) {
          log.warn({ err: error, matchId: dbMatchId }, "Failed to check/cancel reminder jobs after assignment");
        }
```

- [ ] **Step 4: Handle referee unassignment (slot re-opens)**

In the same function, find where assignments are removed or detect when a referee is unassigned. If a previously-filled match now has an empty slot again, re-create reminder jobs. After the removal/unassignment handling, add:

```typescript
        // If a referee was removed and the match is an own-club home game,
        // re-create reminders for thresholds that haven't passed yet
        if (isRemoval && refCtx.isOwnClubHome && refCtx.isOwnClubRefsLeague) {
          try {
            const match = await db.select({
              kickoffDate: matches.kickoffDate,
              kickoffTime: matches.kickoffTime,
            }).from(matches).where(eq(matches.id, dbMatchId)).limit(1);

            if (match[0]) {
              await scheduleReminderJobs(dbMatchId, match[0].kickoffDate, match[0].kickoffTime);
            }
          } catch (error) {
            log.warn({ err: error, matchId: dbMatchId }, "Failed to re-schedule reminders after unassignment");
          }
        }
```

Note: The exact hook point depends on how unassignment is detected in the existing `syncRefereeAssignmentsFromData`. The implementing engineer should find where referee removals are processed and add this logic there. Import `scheduleReminderJobs` from `matches.sync.ts` or extract it to the reminders service.

- [ ] **Step 5: Run typecheck**

Run: `pnpm --filter @dragons/api typecheck`
Expected: PASS

- [ ] **Step 6: Run existing referee sync tests**

Run: `pnpm --filter @dragons/api test -- apps/api/src/services/sync/referees.sync`
Expected: All existing tests PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/sync/referees.sync.ts
git commit -m "feat: cancel/re-create referee reminder jobs on assignment changes during sync"
```

---

### Task 10: WAHA Docker Service

**Files:**
- Modify: `docker/docker-compose.dev.yml`
- Modify: `.env.example`

- [ ] **Step 1: Add WAHA service to Docker Compose**

In `docker/docker-compose.dev.yml`, add:

```yaml
  waha:
    image: devlikeapro/waha
    ports: ["3002:3000"]
    environment:
      WHATSAPP_DEFAULT_ENGINE: WEBJS
      WAHA_PRINT_QR: "true"
    volumes:
      - waha_sessions:/app/.sessions
```

Add `waha_sessions` to the `volumes` section:

```yaml
volumes:
  pgdata:
  waha_sessions:
```

- [ ] **Step 2: Update .env.example**

Add to `.env.example`:

```
# WAHA (WhatsApp HTTP API - for group notifications)
WAHA_BASE_URL=http://localhost:3002
WAHA_SESSION=default
```

- [ ] **Step 3: Commit**

```bash
git add docker/docker-compose.dev.yml .env.example
git commit -m "feat: add WAHA Docker service for WhatsApp group notifications"
```

---

### Task 11: Admin Setting for Reminder Days

**Files:**
- Modify: `apps/api/src/routes/admin/settings.routes.ts` (or create a new route)
- The setting is stored in `appSettings` table as `referee_reminder_days`

- [ ] **Step 1: Check if settings routes exist for generic key-value pairs**

Read `apps/api/src/routes/admin/settings.routes.ts` to understand the existing settings API pattern.

- [ ] **Step 2: Add GET/PUT endpoints for referee reminder days**

If the settings routes don't already support arbitrary keys, add specific endpoints. In the settings routes file:

```typescript
// GET /admin/settings/referee-reminders
app.get("/referee-reminders", requireAdmin, async (c) => {
  const value = await getSetting("referee_reminder_days");
  const days = value ? JSON.parse(value) : [7, 3, 1];
  return c.json({ days });
});

// PUT /admin/settings/referee-reminders
app.put("/referee-reminders", requireAdmin, async (c) => {
  const body = await c.req.json();
  const schema = z.object({
    days: z.array(z.number().int().positive()).min(1).max(10),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }
  const sorted = parsed.data.days.sort((a, b) => b - a);
  await upsertSetting("referee_reminder_days", JSON.stringify(sorted));
  return c.json({ days: sorted });
});
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @dragons/api typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/admin/settings.routes.ts
git commit -m "feat: add admin endpoints for referee reminder days configuration"
```

---

### Task 12: Full Integration Test

**Files:**
- Run all tests, check coverage, lint

- [ ] **Step 1: Run full test suite**

Run: `pnpm --filter @dragons/api test`
Expected: All tests PASS

- [ ] **Step 2: Run coverage**

Run: `pnpm --filter @dragons/api coverage`
Expected: Coverage thresholds met (90% branches, 95% functions/lines/statements)

- [ ] **Step 3: Run typecheck across all packages**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Run lint**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address test/lint/coverage issues from referee notification system"
```
