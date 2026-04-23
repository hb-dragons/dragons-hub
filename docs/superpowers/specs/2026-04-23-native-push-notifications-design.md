# Native Push Notifications — Design Spec

## Problem

The native app (`apps/native`, Expo SDK 55) has `expo-notifications` installed but no integration. Users who get assigned as referees, or admins who need to know about match cancellations, currently have to open the app or web and check in-app notifications. Time-sensitive events like same-day referee assignments get missed.

The server already has a rich notification pipeline with domain events, a rule engine, per-user preferences, digests, templates, and channel adapters for in-app and WhatsApp group delivery. A `push_devices` table exists and a `/devices/register` endpoint accepts tokens, but no adapter sends anything to a device.

## Goal

Close the native push loop end-to-end:

1. Native client requests permission on sign-in, acquires an Expo push token, registers it with the API
2. A new push channel adapter plugs into the existing pipeline
3. Personal and high-urgency events (referee assignments, match cancellations, referee slot requests and reminders) trigger push delivery to the recipient's registered devices
4. Native handles foreground banners, tap-to-deep-link in foreground / background / cold start
5. Receipts are reconciled on a cron; invalid tokens are purged automatically
6. An admin test-push button in web validates the whole path end-to-end against the admin's own device

## Scope

**In scope:**
- Expo Push Service as the delivery provider
- Server push channel adapter mirroring the existing `whatsapp-group.ts` pattern
- Receipt-polling cron worker
- Native-side permission flow, token registration, foreground handler, tap routing (foreground / background / cold start)
- Per-event fan-out: extend `role-defaults.ts` so `PUSH_ELIGIBLE_EVENTS` emit both `in_app` and `push` channel entries
- Templates for push payloads (title, body, data with `deepLink`) in German and English
- Admin test-push endpoint + web UI card
- German club — no behavioral change to WhatsApp group delivery or in-app

**Out of scope (deferred):**
- Email channel (separate spec later; pipeline already supports it architecturally)
- Web push for `apps/web` (service worker + VAPID — separate spec if demand surfaces)
- Native preferences screen for per-event muting (backend supports `mutedEventTypes`, UI later)
- Badge counter management
- Action buttons on notifications (Accept / Decline inline)
- iOS critical alerts
- Rich notifications (images, expanded layouts)

---

## Architecture

### System diagram

```
┌─ NATIVE (apps/native) ────────────────────┐
│  App boot                                  │
│   ├─ configureNotificationHandler()        │
│   └─ subscribe tap listener + cold-start   │
│                                            │
│  On sign-in                                │
│   └─ registerForPush:                      │
│       ├─ permission check                  │
│       ├─ getExpoPushTokenAsync             │
│       └─ POST /devices/register            │
│                                            │
│  On sign-out                               │
│   └─ DELETE /devices/{token}               │
└───────────────────────────────────────────┘
              │ HTTPS
              ▼
┌─ API (apps/api) ──────────────────────────┐
│  Sync workers emit domain events           │
│              │                             │
│              ▼                             │
│  notification-pipeline.processEvent        │
│    → role-defaults (widened)               │
│    → channel adapters:                     │
│        • in_app.ts          (exists)       │
│        • whatsapp-group.ts  (exists)       │
│        • push.ts            NEW            │
│              │                             │
│              ▼                             │
│  Expo Push API (exp.host/--/api/v2/push)   │
│              │                             │
│              ▼                             │
│  notification_log                          │
│    providerTicketId, status="sent_ticket"  │
│                                            │
│  push-receipt.worker  NEW (cron every 15m) │
│    poll /receipts, update status           │
│    purge invalid push_devices              │
└───────────────────────────────────────────┘
              │ APNs / FCM (Expo-managed)
              ▼
         user device
```

### Event flow example: `referee.assigned`

1. `referees.sync.ts` detects a new assignment → emits domain event `referee.assigned` with payload `{ refereeId: 42, matchId: 123, ... }`
2. Pipeline looks up `role-defaults.getDefaultNotificationsForEvent` → returns two entries:
   - `{ audience: "referee", channel: "in_app", refereeId: 42 }`
   - `{ audience: "referee", channel: "push", refereeId: 42 }` (added because `referee.assigned` is in `PUSH_ELIGIBLE_EVENTS`)
3. In-app adapter writes `notifications` row (existing behavior)
4. Push adapter:
   - Resolves `refereeId=42` → user id `u_abc` via referee → user link
   - Checks `userNotificationPreferences.mutedEventTypes` does not include `referee.assigned`
   - Loads `push_devices WHERE user_id='u_abc'` → one or more tokens
   - Renders template: `{ title, body, data: { deepLink: "/referee-game/123", eventType, eventId } }`
   - Calls `expoPushClient.sendBatch(messages)` → tickets array
   - Inserts `notification_log` rows with `providerTicketId`, `status="sent_ticket"`
5. Expo relays to APNs (iOS) and FCM (Android)
6. Native device receives:
   - Foreground → banner via `setNotificationHandler` config
   - Background → OS notification
   - Killed → OS notification
7. User taps → `router.push("/referee-game/123")`
8. About 15 min later, `push-receipt.worker` polls `/receipts` with the ticket IDs:
   - `ok` → `status="delivered"`
   - `DeviceNotRegistered` → `status="failed"` + `DELETE FROM push_devices` for that token

### Key design invariants

- **In-app is source of truth.** Every role-default emission still writes an in-app `notifications` row regardless of push outcome. Push is additive, never replaces in-app.
- **No push without a device.** Zero `push_devices` rows for a user → push adapter skips silently (no `notification_log` push row, no error). In-app still delivered.
- **Per-event muting reuses existing infra.** `userNotificationPreferences.mutedEventTypes` is consulted before send.
- **Adapter is provider-agnostic at the interface.** Swapping Expo Push for direct FCM/APNs later is a single-file change inside the adapter.
- **Receipt reconciliation is out-of-band.** Send path is fast and failure-tolerant. Delivery state converges asynchronously via the cron worker.

---

## Data Model Changes

### 1. `push_devices` — extend existing

```ts
pushDevices = pgTable("push_devices", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  token: text("token").notNull(),
  platform: varchar("platform", { length: 10 }).notNull(),
  locale: text("locale"),                                            // NEW
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })      // NEW
    .defaultNow()
    .notNull(),
  createdAt: ...,
  updatedAt: ...,
});
```

- `locale` — reported by native at registration (e.g., `"de-DE"`, `"en-US"`); used as fallback when `userNotificationPreferences.locale` is missing
- `lastSeenAt` — bumped by `onConflictDoUpdate` on every re-register call from native; future cleanup job can prune devices unused for >90 days

Invalid-token cleanup: `DELETE FROM push_devices WHERE token = ?` — no soft-delete, no enabled flag. Expo receipts tell us definitively when a token is dead.

### 2. `notification_log` — extend existing

```ts
notificationLog = pgTable("notification_log", {
  ...existing,
  providerTicketId: text("provider_ticket_id"),                     // NEW
  providerReceiptCheckedAt: timestamp(                              // NEW
    "provider_receipt_checked_at",
    { withTimezone: true },
  ),
  recipientToken: text("recipient_token"),                          // NEW (push only; null otherwise)
});
```

`recipientToken` stores the specific device token a push row was sent to. Required because Expo's receipt response does not echo the original token, and one user may have multiple devices — the receipt worker needs the token to purge the right `push_devices` row on `DeviceNotRegistered`.

Status values (existing `status` text column; no schema change):
- `pending` (existing) — log row created, not yet sent
- `sent_ticket` (new value) — Expo accepted, ticket stored, receipt not yet polled
- `delivered` (new value) — receipt confirms delivery
- `failed` (existing) — rejected at submission or via receipt; `errorMessage` holds reason

### 3. `channel_configs` — seed a row via migration

```ts
{
  name: "Expo Push",
  type: "push",
  enabled: true,
  config: { provider: "expo" },
  digestMode: "immediate",
  digestTimezone: "Europe/Berlin",
}
```

No schema change. `config.provider` leaves the door open for swapping to direct FCM/APNs later.

### 4. `userNotificationPreferences` — no change

Existing fields handle:
- `mutedEventTypes` — global per-event silencer; applies to push
- `locale` — primary language for template rendering
- Existing booleans (e.g., `notifyOnTaskAssigned`) — pipeline already honors these

No push-specific opt-out boolean. Presence of registered devices = implicit opt-in.

### 5. `role-defaults.ts` — code change, no schema

Widen `DefaultNotification.channel` to the union `"in_app" | "push"`. Add:

```ts
const PUSH_ELIGIBLE_EVENTS = new Set([
  "referee.assigned",
  "referee.unassigned",
  "referee.reassigned",
  "referee.slots.needed",
  "referee.slots.reminder",
  "match.cancelled",
  "match.rescheduled",
]);
```

Fan-out rule: for every `in_app` entry produced, append a parallel `push` entry if `PUSH_ELIGIBLE_EVENTS.has(eventType)`. Pipeline treats each entry as an independent dispatch.

### Migration

Single Drizzle migration:
- `ALTER TABLE push_devices ADD COLUMN locale text`
- `ALTER TABLE push_devices ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now()`
- `ALTER TABLE notification_log ADD COLUMN provider_ticket_id text`
- `ALTER TABLE notification_log ADD COLUMN provider_receipt_checked_at timestamptz`
- `ALTER TABLE notification_log ADD COLUMN recipient_token text`
- `INSERT INTO channel_configs (...) VALUES (...)` for the Expo Push row

All additive, all rollback-safe.

---

## Components

### Server (`apps/api`)

#### `src/services/notifications/expo-push.client.ts` — NEW (~120 lines)

Thin HTTP wrapper around Expo Push API.

```ts
interface ExpoPushMessage {
  to: string;            // ExponentPushToken[...]
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

class ExpoPushClient {
  sendBatch(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]>
  getReceipts(ticketIds: string[]): Promise<Record<string, ExpoPushReceipt>>
}
```

- Batches `sendBatch` into chunks of 100 (Expo's hard limit)
- Batches `getReceipts` into chunks of 1000
- Uses `EXPO_ACCESS_TOKEN` as bearer auth if set (recommended in production)
- Uses gzip on request body
- Timeouts: 30s per request
- Throws on network or 5xx; structured error for 4xx

#### `src/services/notifications/channels/push.ts` — NEW (~150 lines)

Channel adapter implementing the existing channel adapter interface (same signature as `whatsapp-group.ts` and `in-app.ts`).

Responsibilities:
1. `resolveRecipients(audience, refereeId)` → array of `{ userId, locale }`
   - `audience === "admin"` → all users with admin role (query via better-auth user table where role = admin)
   - `audience === "referee"` + `refereeId` → referee → linked user id (one row)
2. For each recipient:
   - Load `push_devices WHERE user_id = ?`
   - If empty → skip recipient
   - Check `userNotificationPreferences.mutedEventTypes` → if event type muted, skip
   - Pick locale: `userNotificationPreferences.locale` → `push_devices.locale` → `"de"` (default)
   - Render template for `(eventType, payload, locale)` → `{ title, body, data }`
3. Build `ExpoPushMessage[]` across all recipients + devices
4. Call `expoPushClient.sendBatch(messages)` once
5. Insert `notification_log` rows: one per (recipient, device), with `providerTicketId`, `status="sent_ticket"` or `"failed"`
6. On batch-level exception: all rows → `status="failed"`, `errorMessage="network"` or similar

Per-recipient errors do not abort the batch — one bad template render or one bad token does not sink the whole send.

#### `src/services/notifications/templates/push/` — NEW directory

```
referee-assigned.ts        de + en → { title, body, data: { deepLink: "/referee-game/{id}", ... } }
referee-unassigned.ts      de + en
referee-reassigned.ts      de + en
referee-slots.ts           de + en (reuses slot-fill logic from existing referee-slots.ts template)
match-cancelled.ts         de + en
match-rescheduled.ts       de + en
```

Template signature: `(payload, locale) → { title: string; body: string; data: { deepLink: string; eventType: string; eventId: string } }`.

Constraints:
- Body ≤ 178 chars (iOS truncates at that length on lock screen)
- Title ≤ 50 chars
- `data` must be JSON-serializable and ≤ 4KB total payload

Templates are pure functions, easy to unit test.

#### `src/workers/push-receipt.worker.ts` — NEW (~100 lines)

BullMQ cron worker, runs every 15 minutes (mirror `digest.worker` scheduling).

Query:
```sql
SELECT id, provider_ticket_id
FROM notification_log
WHERE status = 'sent_ticket'
  AND provider_ticket_id IS NOT NULL
  AND (provider_receipt_checked_at IS NULL
       OR provider_receipt_checked_at < now() - interval '15 minutes')
  AND created_at > now() - interval '24 hours'
LIMIT 5000
```

For each result:
1. Group ticket IDs into batches of ≤1000
2. Call `expoPushClient.getReceipts(ticketIds)`
3. For each ticket:
   - Has entry, `status: ok` → `status="delivered"`
   - Has entry, `status: error`, `details.error === "DeviceNotRegistered"` → `status="failed"`, `errorMessage="device_not_registered"`, `DELETE FROM push_devices WHERE token = <token from joined message>`
   - Has entry, other error → `status="failed"`, `errorMessage=<error>`
   - No entry + age < 24h → skip, update `providerReceiptCheckedAt` to now
   - No entry + age > 24h → `status="failed"`, `errorMessage="receipt_expired"`

Worker is idempotent. Worker timeout 60s. On error, BullMQ auto-retries next cycle.

Token-to-purge mapping uses the `recipientToken` column on `notification_log` (added in the Data Model migration above) — Expo receipts do not echo the original token, so we store it at send time to identify which `push_devices` row to delete on `DeviceNotRegistered`.

#### `src/services/notifications/notification-pipeline.ts` — modified

Add a `"push"` case to the channel dispatch (existing switch or map). Delegates to the push adapter. No other logic change.

#### `src/services/notifications/role-defaults.ts` — modified

- Widen type union
- Add `PUSH_ELIGIBLE_EVENTS`
- After pushing each `in_app` entry in `getDefaultNotificationsForEvent`, conditionally append a matching `push` entry

#### `src/workers/index.ts` — modified

Register `push-receipt.worker` with BullMQ, schedule cron every 15 min.

#### `src/routes/device.routes.ts` — modified

Accept optional `locale` in register body. Update `onConflictDoUpdate` to bump `lastSeenAt`.

#### `src/config/env.ts` — modified

Optional new env vars:
- `EXPO_ACCESS_TOKEN` — authenticated Expo Push requests (higher rate limits, better receipt SLA)
- `EXPO_PROJECT_ID` — validates on boot so mismatch is caught early

### Native (`apps/native`)

#### `src/lib/push/registration.ts` — NEW (~80 lines)

```ts
async function registerForPush(api: ApiClient): Promise<void> {
  if (!Device.isDevice) return;  // simulator — skip silently

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.warn("[push] missing projectId, push disabled");
    return;
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
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
      platform: Platform.OS,   // "ios" | "android"
      locale,
    });
  } catch (err) {
    console.warn("[push] registration failed", err);
  }
}

async function unregisterForPush(api: ApiClient): Promise<void> {
  if (!Device.isDevice) return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.delete(`/devices/${encodeURIComponent(token)}`);
  } catch (err) {
    console.warn("[push] unregister failed", err);
  }
}
```

Always re-register on every authenticated app boot (no SecureStore caching). Server upsert is idempotent.

#### `src/lib/push/handler.ts` — NEW (~60 lines)

```ts
export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export function subscribeToTaps(router: Router): () => void {
  // Live taps (foreground + background resume)
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    handleTap(response, router);
  });
  return () => sub.remove();
}

export async function checkColdStartTap(router: Router) {
  const response = await Notifications.getLastNotificationResponseAsync();
  if (response) handleTap(response, router);
}

function handleTap(
  response: Notifications.NotificationResponse,
  router: Router,
) {
  const deepLink = response.notification.request.content.data?.deepLink;
  if (typeof deepLink === "string" && deepLink.length > 0) {
    router.push(deepLink as Href);
  }
}
```

#### `src/hooks/usePushRegistration.ts` — NEW (~40 lines)

Hook mounted inside `SessionProvider` in `_layout.tsx`:
- Subscribes to taps + checks cold-start tap on mount
- When session becomes authenticated, calls `registerForPush`
- When session becomes unauthenticated (sign-out), calls `unregisterForPush`

#### `apps/native/src/app/_layout.tsx` — modified

- Call `configureNotificationHandler()` at module scope (runs once on bundle load)
- Mount `usePushRegistration()` inside the auth-context tree

#### `apps/native/app.config.ts` (or `app.json`) — modified

Configure `expo-notifications` plugin:
- iOS: notification icon, sound
- Android: notification channel (default), icon, color
- Already has `extra.eas.projectId` for EAS Build

---

## Native Client Deep Dive

### Permission lifecycle

1. **App boot** → `configureNotificationHandler()` (no permission needed)
2. **User signs in** → `registerForPush()`:
   - `getPermissionsAsync()` → `granted` | `undetermined` | `denied`
   - If `undetermined` → `requestPermissionsAsync()` prompts once
   - If `denied` (now or previously) → no-op; app never re-prompts (iOS system limit). User must toggle in Settings. Profile screen later will show an explainer + deep link to `Linking.openSettings()`.
   - If `granted` → fetch token, POST register
3. **Android 13+**: `POST_NOTIFICATIONS` runtime permission is handled transparently by the same flow via Expo plugin config.

### Token acquisition

```ts
const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
// "ExponentPushToken[xxxxx...]"
```

`projectId` must match the EAS project. Missing in production → silent no-op (logged warning).

### Re-register on every authenticated boot

Simpler than token-cache comparison. One HTTP call per cold start. Server upsert is idempotent. `lastSeenAt` reliably tracks active devices.

### Sign-out flow

```ts
async function signOut() {
  await unregisterForPush(api);  // DELETE while still authenticated
  await auth.signOut();           // then clear session
}
```

Order matters: DELETE requires auth. If it fails (e.g., offline), the stale row self-heals on the next send via `DeviceNotRegistered` receipt → worker purges.

### Foreground handler

Configured once at module scope. Shows a banner, adds to the notification list, plays sound, skips badge. No per-screen suppression in v1 (deferred as the Approach C variant).

### Tap handling — three cases

| App state at tap | API | Fires? |
|---|---|---|
| Foreground (banner) | `addNotificationResponseReceivedListener` | ✅ live |
| Background (resumed via tap) | Same listener | ✅ live |
| Killed (cold start from tap) | `getLastNotificationResponseAsync` | ❌ listener does not fire — must check on mount |

Both paths converge on `handleTap` which reads `data.deepLink` and calls `router.push`.

If the deep link targets a gated screen (e.g., user signed out), `expo-router` routes them to the auth gate per existing `_layout.tsx` logic — no extra code needed.

### Deep-link contract

Server template sets `deepLink` in `data`, not in the body:

```json
{
  "title": "Schiedsrichter zugewiesen",
  "body": "Du wurdest als SR1 für Dragons U16 vs. TSV Neustadt eingesetzt.",
  "data": {
    "deepLink": "/referee-game/123",
    "eventType": "referee.assigned",
    "eventId": "evt_abc..."
  }
}
```

v1 deep links by event type:
- `referee.assigned` / `unassigned` / `reassigned` → `/referee-game/[id]`
- `referee.slots.needed` / `reminder` → `/(tabs)/referee`
- `match.cancelled` / `rescheduled` → `/game/[id]`
- Admin test push → `/` (home)

### Edge cases

| Case | Handling |
|---|---|
| User denies permission on first prompt | Silent. Profile screen later adds "Enable notifications" explainer + Settings deep link. |
| User revokes permission in OS Settings post-grant | Next send → `DeviceNotRegistered` receipt → server purges row. Token re-acquired on next boot if user re-grants. |
| EAS projectId mismatch | `getExpoPushTokenAsync` throws. Caught, logged, push silently disabled. |
| Shared device: user A signs out, user B signs in | Same token re-registers under user B's userId via `onConflictDoUpdate`. User A no longer receives. |
| Two devices, same user | Two `push_devices` rows. Send fans out to both. Taps route independently. |
| Network failure during registration | Caught, swallowed. Retry on next foreground or sign-in. |
| Token rotation (reinstall, credential change) | New token, new upsert row. Receipt worker eventually purges the old token via `DeviceNotRegistered`. |
| Simulator boot | `Device.isDevice === false` → skip registration silently. |

### Deferred from v1

- Native preferences screen for per-event muting (backend supports `mutedEventTypes`)
- Badge counter
- Action buttons on notifications
- Grouping / Android channels beyond default
- iOS critical alerts
- In-app suppression of push when viewing the same screen as the event target

---

## Admin Test Push

### Behavior

Admin opens web → admin settings → "Notifications" section → sees:
- Count of registered devices tied to their own user
- "Send test push" button (disabled if device count = 0)
- Optional custom message
- Recent results list: last 10 test pushes with timestamp, platform, status, error

Click → server sends a test push to all of the admin's own registered devices. Native app shows the banner. After ≈15 min, status updates to `delivered` once the receipt worker finishes a cycle.

**Self-send only in v1** — the admin can test against their own devices, not send to arbitrary users. Avoids abuse, keeps the UX narrow.

### Server endpoint

```
POST /api/admin/notifications/test-push
  Auth: admin role (existing RBAC middleware)
  Body: { message?: string }  (optional, default "Test push from Dragons admin")

  1. callerId = session.user.id
  2. devices = push_devices WHERE userId = callerId
  3. If empty → 400 { error: "no_devices", message: "Open the native app on a signed-in device first." }
  4. payload = {
       title: "🏀 Dragons — Test",
       body: message ?? "Test push from Dragons admin",
       data: {
         deepLink: "/",
         isTest: true,
         sentAt: new Date().toISOString(),
       },
     }
  5. tickets = await expoPushClient.sendBatch(devices.map(d => ({ to: d.token, ...payload })))
  6. Insert notification_log rows:
       eventId = "admin_test:{callerId}:{timestamp}"
       recipientId = callerId
       recipientToken = d.token
       channelConfigId = push channel id
       status = "sent_ticket" | "failed"
       providerTicketId = ticket.id
  7. Return { deviceCount, tickets: [{ platform, status, ticketId, error? }] }
```

Direct adapter call — bypasses role-defaults and watch rules. Validates the delivery path, not the routing logic.

```
GET /api/admin/notifications/test-push/recent
  Returns last 10 notification_log rows WHERE eventId LIKE 'admin_test:{callerId}:%'
  Fields: sentAt, recipientToken (masked to last 6 chars), providerTicketId, status, errorMessage
```

Receipt worker handles these naturally — eventId prefix is transparent to it.

### Web UI

New card:

```
apps/web/src/components/admin/push-test-card.tsx (~100 lines)

- "Push notification test" section
- Device count badge fetched from a helper endpoint (or computed from /test-push/recent)
- Textarea (optional message)
- "Send test push" button (disabled if devices = 0 or request in flight)
- Table of recent results
  - polls GET /test-push/recent every 5s via SWR while the page is open
  - columns: timestamp, platform, status, error
```

Mounted on `apps/web/src/app/admin/settings/notifications/page.tsx` (new route) or added to the existing admin settings page as a card.

### Native

Zero changes. Test payload flows through the existing handler. `isTest: true` in `data` is informational only — no branching on it in v1. Deep link `/` opens the home tab.

### Files added / modified for test push

- `apps/api/src/routes/admin/notification-test.routes.ts` — NEW
- `apps/api/src/routes/admin/notification-test.routes.test.ts` — NEW
- `apps/api/src/routes/admin/index.ts` — modified (register route)
- `apps/web/src/components/admin/push-test-card.tsx` — NEW
- `apps/web/src/app/admin/settings/notifications/page.tsx` — NEW (or slot into existing admin settings page)

No schema change beyond what the main design already adds.

---

## Error Handling

### Send path

| Failure | Source | Handling |
|---|---|---|
| Network error to Expo | HTTP client | Catch, write `notification_log.status="failed"`, `errorMessage="network"`. No re-send; next fresh event supersedes. |
| HTTP 4xx (malformed) | Expo response | Log with payload, `status="failed"`. Indicates a bug → alert via existing log pipeline. |
| HTTP 429 rate limit | Expo response | `status="failed"`. At club volume, this should not happen. Add `EXPO_ACCESS_TOKEN` to raise quotas if it ever does. |
| Per-ticket errors in batch | Expo response | Ticket-by-ticket: `ok` → `sent_ticket`, `error` → `failed` with `errorMessage`. |
| Recipient has no devices | Adapter | Skip silently. No push `notification_log` row. (In-app row is still written by its own adapter.) |
| Template render throws | Adapter | Catch per-recipient. `status="failed"`, `errorMessage="template_error"`. Other recipients unaffected. |
| DB write fails after Expo accepted | Adapter | Push already en route. Log warning — orphan ticket (receipt worker can't find its log row). Rare and acceptable. |

### Receipt path

| Receipt outcome | Action |
|---|---|
| `ok` | `status="delivered"`, `providerReceiptCheckedAt=now` |
| `error: DeviceNotRegistered` | `status="failed"`, `errorMessage="device_not_registered"`. `DELETE FROM push_devices WHERE token = <recipientToken>`. |
| `error: MessageTooBig` | `status="failed"`. Indicates template bug (payload >4KB). Alert. |
| `error: MessageRateExceeded` | `status="failed"`. Should not happen at scale; if repeated, throttle in adapter. |
| `error: MismatchSenderId` / `InvalidCredentials` | `status="failed"`. Indicates EAS credential drift. Alert. |
| `error` (other) | `status="failed"`, `errorMessage=<raw>`. |
| No receipt entry yet | Skip; worker retries next cycle. `providerReceiptCheckedAt` still updated to avoid tight loops. |
| No receipt entry, age >24h | `status="failed"`, `errorMessage="receipt_expired"`. Stop polling. |

### Worker liveness

- Cron every 15 min via BullMQ repeatable job (pattern copied from `digest.worker`)
- Idempotent — re-running on same tickets is safe
- Batched: ≤1000 ticket IDs per Expo receipts call
- Per-run timeout 60s; stuck worker auto-fails, next cycle retries
- Bounded query: `WHERE created_at > now() - 24h` prevents unbounded scans

### Native registration path

| Failure | Handling |
|---|---|
| Missing projectId | `getExpoPushTokenAsync` throws → caught → no-op, logged. Push silently disabled. |
| Permission denied | No-op. No retry (iOS can't re-prompt). Profile screen later shows explainer + Settings deep link. |
| Network failure on register | Caught, swallowed. Retried on next foreground / sign-in. |
| Server rejects token (401) | Logged. Retried next boot. |
| Sign-out DELETE fails | Logged. Stale row self-heals via receipt-driven purge on first future send. |

---

## Testing Strategy

### Server unit tests (Vitest, mocked HTTP)

```
expo-push.client.test.ts
  ✓ batches >100 messages into multiple POSTs preserving order
  ✓ adds Authorization header when EXPO_ACCESS_TOKEN is set
  ✓ omits Authorization header when unset
  ✓ throws on network error
  ✓ parses ticket array correctly
  ✓ getReceipts: empty input → no HTTP call
  ✓ getReceipts: batches >1000 IDs across calls
  ✓ gzip enabled on request body

channels/push.test.ts
  ✓ resolveRecipients(admin) → all admin users with devices
  ✓ resolveRecipients(referee, refereeId) → just that referee's user
  ✓ recipient with no push_devices → skipped, no log row
  ✓ event in user's mutedEventTypes → skipped
  ✓ locale selection: user pref → device locale → "de"
  ✓ Expo network error → all rows status=failed, retryCount=1
  ✓ mixed batch (some ok, some error) → per-ticket statuses correct
  ✓ template throws for one recipient → others still sent
  ✓ inserts recipientToken in notification_log for push rows

templates/push/*.test.ts
  ✓ each template: de + en variants render title/body/data
  ✓ deepLink format matches an expo-router route
  ✓ body ≤ 178 chars across all payload variants
  ✓ data is JSON-serializable

workers/push-receipt.worker.test.ts
  ✓ ok receipt → status=delivered
  ✓ DeviceNotRegistered → status=failed AND push_devices row deleted for matching token
  ✓ other error → status=failed, errorMessage recorded
  ✓ no receipt yet, age <24h → row status unchanged, providerReceiptCheckedAt updated
  ✓ no receipt, age >24h → status=failed, errorMessage=receipt_expired
  ✓ batches ticket IDs in groups of 1000
  ✓ skips rows with provider_ticket_id IS NULL
  ✓ idempotent — running twice produces same end state

role-defaults.test.ts (extend existing)
  ✓ PUSH_ELIGIBLE event → emits in_app + push entries for same audience
  ✓ non-eligible event → emits in_app only
  ✓ referee.reassigned → push entries for both old and new referee

admin/notification-test.routes.test.ts
  ✓ non-admin → 403
  ✓ admin with no devices → 400 no_devices
  ✓ admin with devices → 200, correct Expo call, log rows created with admin_test eventId prefix
  ✓ mixed success/failure → per-ticket status
  ✓ GET /recent returns only caller's test rows, ordered desc, max 10
  ✓ GET /recent masks recipientToken to last 6 chars
```

### Server integration tests (PGlite-based)

```
notification-pipeline.test.ts (extend)
  ✓ referee.assigned → notification_log push row with ticketId for the assigned referee's device
  ✓ match.cancelled → push rows for every admin with at least one device
  ✓ user with event in mutedEventTypes → no push row (in_app row still present)
  ✓ user without devices → only in_app row, no push row
```

### Native tests

Limited — Expo APIs are hard to mock inside Jest/Vitest. Cover what's pure logic:

```
src/lib/push/registration.test.ts
  ✓ denied permission path → no register call
  ✓ happy path POSTs correct body shape
  ✓ simulator (Device.isDevice=false) → no-op

src/lib/push/handler.test.ts
  ✓ handleTap routes to deepLink from data payload
  ✓ handleTap ignores notification with missing deepLink
  ✓ handleTap ignores notification with non-string deepLink
```

### Manual QA matrix

Before promoting to production:

| Scenario | iOS | Android |
|---|---|---|
| Fresh install, sign in, accept permission, receive push | ☐ | ☐ |
| Deny permission on first prompt | ☐ | ☐ |
| Re-grant permission via Settings, reopen app | ☐ | ☐ |
| Push received in foreground → banner shown | ☐ | ☐ |
| Push received in background → tap opens deep link | ☐ | ☐ |
| Push received while app killed → cold-start tap opens deep link | ☐ | ☐ |
| Sign out → next push to that user not delivered | ☐ | ☐ |
| Two devices same user → both receive | ☐ | ☐ |
| Reinstall app → new token registers, old purged via receipt | ☐ | ☐ |
| Device locale = de-DE → German template rendered | ☐ | ☐ |
| Device locale = en-US → English template rendered | ☐ | ☐ |
| Admin test push from web → receive + status=delivered after cycle | ☐ | ☐ |

---

## Rollout

Single PR; no feature flag. Push is additive — existing in-app and WhatsApp delivery keep working unchanged. If push breaks, other channels are unaffected.

### Step 1 — Server merge
- Drizzle migration deploys (additive columns + channel_configs row)
- Push adapter ships dormant — no devices registered yet → no log rows written
- Receipt worker starts, idle (no tickets to poll)
- Risk: near-zero; pipeline gains a path it cannot yet reach

### Step 2 — Native merge + EAS build
- Push registration flow ships in the next native build
- TestFlight / internal track first → 1-2 internal testers register
- Trigger known events (test referee assignment) → verify delivery end-to-end
- Check `notification_log` for `delivered` status after receipt cycle
- If clean, promote to production

### Step 3 — Monitor
- `notification_log` status distribution — `failed` rate should settle <5%
- `push_devices` purge rate from receipt worker — spike indicates wider issue
- Admin test push as a smoke signal — any admin can run it anytime

### Rollback

`UPDATE channel_configs SET enabled=false WHERE type='push'` → pipeline skips push, in-app continues. Native client is harmless without server delivery. No migration reversal needed.

---

## Operational Notes

- `EXPO_ACCESS_TOKEN` recommended in production: authenticated send tier has higher rate limits and better receipt SLA. Free without it.
- `EXPO_PROJECT_ID` validated in the env schema; mismatch surfaces at boot.
- No new infrastructure. Reuses BullMQ, Redis, Postgres.
- No new dependencies on the server side beyond the Expo HTTP client (implemented as a plain `fetch` wrapper, no `expo-server-sdk` dependency needed — small, stable API).
- Native already depends on `expo-notifications`, `expo-constants`, `expo-device` (add if missing), `expo-linking` (for Settings deep link later), `expo-localization`.

### New environment variables

```
# Server (apps/api)
EXPO_ACCESS_TOKEN=<optional, from expo.dev account settings>
EXPO_PROJECT_ID=<matches EAS project in app.config.ts>
```

Both optional; fall back to unauthenticated mode + runtime warning if missing in production.

---

## Summary of File Changes

**New (server):**
- `apps/api/src/services/notifications/expo-push.client.ts` + test
- `apps/api/src/services/notifications/channels/push.ts` + test
- `apps/api/src/services/notifications/templates/push/*.ts` (6 files) + tests
- `apps/api/src/workers/push-receipt.worker.ts` + test
- `apps/api/src/routes/admin/notification-test.routes.ts` + test

**New (native):**
- `apps/native/src/lib/push/registration.ts` + test
- `apps/native/src/lib/push/handler.ts` + test
- `apps/native/src/hooks/usePushRegistration.ts`

**New (web):**
- `apps/web/src/components/admin/push-test-card.tsx`
- `apps/web/src/app/admin/settings/notifications/page.tsx`

**Modified (server):**
- `packages/db/src/schema/push-devices.ts` — +2 columns (locale, lastSeenAt)
- `packages/db/src/schema/notification-log.ts` — +3 columns (providerTicketId, providerReceiptCheckedAt, recipientToken)
- `apps/api/src/services/notifications/role-defaults.ts`
- `apps/api/src/services/notifications/notification-pipeline.ts`
- `apps/api/src/workers/index.ts`
- `apps/api/src/routes/device.routes.ts`
- `apps/api/src/routes/admin/index.ts`
- `apps/api/src/config/env.ts`

**Modified (native):**
- `apps/native/app.config.ts` (or `app.json`) — expo-notifications plugin config
- `apps/native/src/app/_layout.tsx` — mount handler + hook

**Modified (docs):**
- `AGENTS.md` — add push channel + receipt worker
- `CLAUDE.md` — add EXPO_ACCESS_TOKEN, EXPO_PROJECT_ID env vars

**Migration:**
- Single Drizzle migration (auto-generated) — 5 `ALTER TABLE` + 1 `INSERT`

Count: **19 new files, 11 modified files, 1 migration.**
