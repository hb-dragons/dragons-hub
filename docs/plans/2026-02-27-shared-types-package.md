# Shared Types Package Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create `@dragons/shared` package to eliminate ~40 duplicate type definitions between the web and API apps, centralizing enums, constants, validation schemas, and API response types.

**Architecture:** New `packages/shared/` workspace package with pure types, `as const` enum arrays, shared Zod schemas, and a generic pagination type. Both apps import from it. All date/time fields use `string` (the JSON wire format). DB sync internals (`dataHash`, `remoteDataHash`) are excluded.

**Tech Stack:** TypeScript 5.9, Zod 4.3

---

### Task 1: Create shared package scaffold

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`

**Step 1: Create package.json**

```json
{
  "name": "@dragons/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "typescript": "^5.9.3"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "node_modules"]
}
```

**Step 3: Install dependencies**

Run: `cd /Users/jn/git/dragons-all && pnpm install`

**Step 4: Commit**

```
feat(shared): scaffold @dragons/shared package
```

---

### Task 2: Create constants module

**Files:**
- Create: `packages/shared/src/constants.ts`

**Step 1: Write constants.ts**

All enums defined as `as const` arrays with derived types. All regex patterns centralized.

```typescript
// ── Enums ────────────────────────────────────────────────────────────────────

export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const BOOKING_STATUSES = [
  "pending",
  "requested",
  "confirmed",
  "cancelled",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const SYNC_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export const ENTITY_TYPES = [
  "league",
  "match",
  "standing",
  "team",
  "venue",
  "referee",
  "refereeRole",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const ENTRY_ACTIONS = [
  "created",
  "updated",
  "skipped",
  "failed",
] as const;
export type EntryAction = (typeof ENTRY_ACTIONS)[number];

export const DIFF_STATUSES = ["diverged", "synced", "local-only"] as const;
export type DiffStatus = (typeof DIFF_STATUSES)[number];

// ── Validation Patterns ─────────────────────────────────────────────────────

/** Matches YYYY-MM-DD */
export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Matches HH:MM or HH:MM:SS */
export const TIME_REGEX = /^\d{2}:\d{2}(:\d{2})?$/;
```

**Step 2: Commit**

```
feat(shared): add constants module with enums and regex patterns
```

---

### Task 3: Create validation and pagination modules

**Files:**
- Create: `packages/shared/src/validation.ts`
- Create: `packages/shared/src/pagination.ts`

**Step 1: Write validation.ts**

Shared Zod schemas built from constants. The `matchFormSchema` is the base used by both web form validation and API body validation (API extends it with score fields).

```typescript
import { z } from "zod";
import {
  BOOKING_STATUSES,
  TASK_PRIORITIES,
  DATE_REGEX,
  TIME_REGEX,
} from "./constants";

export const dateSchema = z
  .string()
  .regex(DATE_REGEX, "Must be YYYY-MM-DD");

export const timeSchema = z
  .string()
  .regex(TIME_REGEX, "Must be HH:MM or HH:MM:SS");

export const bookingStatusSchema = z.enum(BOOKING_STATUSES);

export const taskPrioritySchema = z.enum(TASK_PRIORITIES);

/**
 * Base match form schema shared between web client validation
 * and API body validation. The API extends this with score fields.
 */
export const matchFormSchema = z.object({
  kickoffDate: dateSchema.nullable().optional(),
  kickoffTime: timeSchema.nullable().optional(),
  isForfeited: z.boolean().nullable().optional(),
  isCancelled: z.boolean().nullable().optional(),
  venueNameOverride: z.string().max(200).nullable().optional(),
  anschreiber: z.string().max(100).nullable().optional(),
  zeitnehmer: z.string().max(100).nullable().optional(),
  shotclock: z.string().max(100).nullable().optional(),
  internalNotes: z.string().max(2000).nullable().optional(),
  publicComment: z.string().max(500).nullable().optional(),
});

export type MatchFormValues = z.infer<typeof matchFormSchema>;
```

**Step 2: Write pagination.ts**

```typescript
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
```

**Step 3: Commit**

```
feat(shared): add validation schemas and pagination type
```

---

### Task 4: Create match domain types

**Files:**
- Create: `packages/shared/src/matches.ts`

**Step 1: Write matches.ts**

Source of truth: combines API's `match-query.service.ts` interfaces with web's `matches/types.ts`, using `string` for all date fields. Excludes sync internals (`currentRemoteVersion`, `currentLocalVersion`, `lastRemoteSync`).

```typescript
import type { DiffStatus } from "./constants";

export interface FieldDiff {
  field: string;
  label: string;
  remoteValue: string | null;
  localValue: string | null;
  status: DiffStatus;
}

export interface OverrideInfo {
  fieldName: string;
  reason: string | null;
  changedBy: string | null;
  createdAt: string;
}

export interface MatchListItem {
  id: number;
  apiMatchId: number;
  matchNo: number;
  matchDay: number;
  kickoffDate: string;
  kickoffTime: string;
  homeTeamApiId: number;
  homeTeamName: string;
  homeTeamNameShort: string | null;
  homeTeamCustomName: string | null;
  guestTeamApiId: number;
  guestTeamName: string;
  guestTeamNameShort: string | null;
  guestTeamCustomName: string | null;
  homeIsOwnClub: boolean;
  guestIsOwnClub: boolean;
  homeScore: number | null;
  guestScore: number | null;
  leagueId: number | null;
  leagueName: string | null;
  venueId: number | null;
  venueName: string | null;
  venueStreet: string | null;
  venueCity: string | null;
  venueNameOverride: string | null;
  isConfirmed: boolean | null;
  isForfeited: boolean | null;
  isCancelled: boolean | null;
  anschreiber: string | null;
  zeitnehmer: string | null;
  shotclock: string | null;
  publicComment: string | null;
  hasLocalChanges: boolean;
  overriddenFields: string[];
}

export interface MatchDetail extends MatchListItem {
  homeHalftimeScore: number | null;
  guestHalftimeScore: number | null;
  periodFormat: string | null;
  homeQ1: number | null;
  guestQ1: number | null;
  homeQ2: number | null;
  guestQ2: number | null;
  homeQ3: number | null;
  guestQ3: number | null;
  homeQ4: number | null;
  guestQ4: number | null;
  homeQ5: number | null;
  guestQ5: number | null;
  homeQ6: number | null;
  guestQ6: number | null;
  homeQ7: number | null;
  guestQ7: number | null;
  homeQ8: number | null;
  guestQ8: number | null;
  homeOt1: number | null;
  guestOt1: number | null;
  homeOt2: number | null;
  guestOt2: number | null;
  internalNotes: string | null;
  createdAt: string;
  updatedAt: string;
  overrides: OverrideInfo[];
}

export interface MatchDetailResponse {
  match: MatchDetail;
  diffs: FieldDiff[];
}

export interface MatchFieldChange {
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
}

export interface MatchChangesResponse {
  changes: MatchFieldChange[];
}
```

**Step 2: Commit**

```
feat(shared): add match domain types
```

---

### Task 5: Create booking, task, and board domain types

**Files:**
- Create: `packages/shared/src/bookings.ts`
- Create: `packages/shared/src/tasks.ts`
- Create: `packages/shared/src/boards.ts`

**Step 1: Write bookings.ts**

```typescript
import type { BookingStatus } from "./constants";

export interface BookingMatch {
  id: number;
  matchNo: number;
  kickoffDate: string;
  kickoffTime: string;
  homeTeam: string;
  guestTeam: string;
}

export interface BookingListItem {
  id: number;
  venueId: number;
  venueName: string;
  date: string;
  calculatedStartTime: string;
  calculatedEndTime: string;
  overrideStartTime: string | null;
  overrideEndTime: string | null;
  effectiveStartTime: string;
  effectiveEndTime: string;
  status: BookingStatus;
  needsReconfirmation: boolean;
  notes: string | null;
  matchCount: number;
  task: { id: number; title: string } | null;
}

export interface BookingDetailTask {
  id: number;
  title: string;
  columnName: string;
  status: string;
}

export interface BookingDetail {
  id: number;
  venueId: number;
  venueName: string;
  date: string;
  calculatedStartTime: string;
  calculatedEndTime: string;
  overrideStartTime: string | null;
  overrideEndTime: string | null;
  overrideReason: string | null;
  effectiveStartTime: string;
  effectiveEndTime: string;
  status: BookingStatus;
  needsReconfirmation: boolean;
  notes: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  matches: BookingMatch[];
  task: BookingDetailTask | null;
}

/** Subset used when showing booking info on task detail */
export interface BookingInfo {
  id: number;
  venueName: string;
  date: string;
  effectiveStartTime: string;
  effectiveEndTime: string;
  status: BookingStatus;
  needsReconfirmation: boolean;
  matches: BookingMatch[];
}
```

**Step 2: Write tasks.ts**

```typescript
import type { TaskPriority } from "./constants";
import type { BookingInfo } from "./bookings";

export interface TaskCardData {
  id: number;
  title: string;
  description: string | null;
  assigneeId: string | null;
  priority: TaskPriority;
  dueDate: string | null;
  position: number;
  columnId: number;
  matchId: number | null;
  venueBookingId: number | null;
  sourceType: string;
  checklistTotal: number;
  checklistChecked: number;
}

export interface ChecklistItem {
  id: number;
  label: string;
  isChecked: boolean;
  checkedBy: string | null;
  checkedAt: string | null;
  position: number;
}

export interface TaskComment {
  id: number;
  authorId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDetail extends TaskCardData {
  sourceDetail: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  checklist: ChecklistItem[];
  comments: TaskComment[];
  booking: BookingInfo | null;
}
```

**Step 3: Write boards.ts**

```typescript
export interface BoardColumnData {
  id: number;
  name: string;
  position: number;
  color: string | null;
  isDoneColumn: boolean;
}

export interface BoardSummary {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
}

export interface BoardData {
  id: number;
  name: string;
  description: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  columns: BoardColumnData[];
}
```

**Step 4: Commit**

```
feat(shared): add booking, task, and board domain types
```

---

### Task 6: Create sync domain types

**Files:**
- Create: `packages/shared/src/sync.ts`

**Step 1: Write sync.ts**

```typescript
import type {
  SyncStatus,
  EntityType,
  EntryAction,
} from "./constants";

interface EntitySyncStats {
  total: number;
  created: number;
  updated: number;
  skipped: number;
}

export interface SyncRunSummary {
  leagues: EntitySyncStats;
  teams: EntitySyncStats;
  matches: EntitySyncStats;
  standings: EntitySyncStats;
  venues: EntitySyncStats;
  referees: {
    created: number;
    updated: number;
    skipped: number;
    rolesUpdated: number;
    assignmentsCreated: number;
  };
}

export interface SyncRun {
  id: number;
  syncType: string;
  status: SyncStatus;
  triggeredBy: string;
  recordsProcessed: number | null;
  recordsCreated: number | null;
  recordsUpdated: number | null;
  recordsFailed: number | null;
  recordsSkipped: number | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  errorStack: string | null;
  summary: SyncRunSummary | null;
  createdAt: string;
}

export interface SyncRunEntry {
  id: number;
  syncRunId: number;
  entityType: EntityType;
  entityId: string;
  entityName: string | null;
  action: EntryAction;
  message: string | null;
  metadata: Record<string, string | number | boolean | null> | null;
  createdAt: string;
}

export interface SyncStatusResponse {
  lastSync: SyncRun | null;
  isRunning: boolean;
}

export interface SyncRunEntriesResponse {
  items: SyncRunEntry[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  summary: {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  };
}

export interface SyncJobData {
  type: string;
  triggeredBy?: string;
}

export interface Job {
  id: string | undefined;
  name: string;
  data: SyncJobData;
  status: string;
  progress: number | object;
  timestamp: number | undefined;
  processedOn: number | undefined;
  finishedOn: number | undefined;
  failedReason: string | undefined;
}

export interface JobsResponse {
  items: Job[];
  validStatuses: string[];
}

export interface SyncScheduleData {
  id: number | null;
  enabled: boolean;
  cronExpression: string;
  timezone: string;
  lastUpdatedAt: string | null;
  lastUpdatedBy: string | null;
}

export interface TriggerResponse {
  jobId: string;
  syncRunId: number;
  message: string;
}

export interface LiveLogEntry {
  entityType: EntityType;
  entityId: string;
  entityName: string | null;
  action: EntryAction;
  message: string | null;
  timestamp: string;
}
```

**Step 2: Commit**

```
feat(shared): add sync domain types
```

---

### Task 7: Create remaining domain types and barrel export

**Files:**
- Create: `packages/shared/src/referees.ts`
- Create: `packages/shared/src/standings.ts`
- Create: `packages/shared/src/venues.ts`
- Create: `packages/shared/src/users.ts`
- Create: `packages/shared/src/notifications.ts`
- Create: `packages/shared/src/settings.ts`
- Create: `packages/shared/src/leagues.ts`
- Create: `packages/shared/src/index.ts`

**Step 1: Write referees.ts**

```typescript
export interface RefereeListItem {
  id: number;
  apiId: number;
  firstName: string | null;
  lastName: string | null;
  licenseNumber: number | null;
  matchCount: number;
  roles: string[];
  createdAt: string;
  updatedAt: string;
}
```

**Step 2: Write standings.ts**

```typescript
export interface StandingItem {
  position: number;
  teamName: string;
  teamNameShort: string | null;
  isOwnClub: boolean;
  played: number;
  won: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  pointsDiff: number;
  leaguePoints: number;
}

export interface LeagueStandings {
  leagueId: number;
  leagueName: string;
  seasonName: string;
  standings: StandingItem[];
}
```

**Step 3: Write venues.ts**

```typescript
export interface VenueListItem {
  id: number;
  apiId: number;
  name: string;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  latitude: string | null;
  longitude: string | null;
}

export interface VenueSearchResult {
  id: number;
  name: string;
  street: string | null;
  city: string | null;
}
```

**Step 4: Write users.ts**

```typescript
export interface UserListItem {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: string | null;
  banned: boolean | null;
  banReason: string | null;
  banExpires: number | null;
  image: string | null;
  createdAt: string;
  updatedAt: string;
}
```

**Step 5: Write notifications.ts**

```typescript
export interface NotificationItem {
  id: number;
  recipientId: string;
  channel: string;
  title: string;
  body: string;
  relatedTaskId: number | null;
  relatedBookingId: number | null;
  status: string;
  sentAt: string | null;
  createdAt: string;
}

export interface NotificationListResult {
  notifications: NotificationItem[];
  total: number;
}
```

**Step 6: Write settings.ts**

```typescript
export interface ClubConfig {
  clubId: number;
  clubName: string;
}

export interface BookingSettings {
  bufferBefore: number;
  bufferAfter: number;
  gameDuration: number;
  dueDaysBefore: number;
}

export const BOOKING_DEFAULTS: BookingSettings = {
  bufferBefore: 60,
  bufferAfter: 60,
  gameDuration: 90,
  dueDaysBefore: 7,
};
```

**Step 7: Write leagues.ts**

```typescript
export interface ResolvedLeague {
  ligaNr: number;
  ligaId: number;
  name: string;
  seasonName: string;
}

export interface ResolveResult {
  resolved: ResolvedLeague[];
  notFound: number[];
  tracked: number;
  untracked: number;
}

export interface TrackedLeague {
  id: number;
  ligaNr: number;
  apiLigaId: number;
  name: string;
  seasonName: string;
}

export interface TrackedLeaguesResponse {
  leagueNumbers: number[];
  leagues: TrackedLeague[];
}
```

**Step 8: Write index.ts (barrel export)**

```typescript
// Constants & enums
export {
  TASK_PRIORITIES,
  BOOKING_STATUSES,
  SYNC_STATUSES,
  ENTITY_TYPES,
  ENTRY_ACTIONS,
  DIFF_STATUSES,
  DATE_REGEX,
  TIME_REGEX,
} from "./constants";
export type {
  TaskPriority,
  BookingStatus,
  SyncStatus,
  EntityType,
  EntryAction,
  DiffStatus,
} from "./constants";

// Validation schemas
export {
  dateSchema,
  timeSchema,
  bookingStatusSchema,
  taskPrioritySchema,
  matchFormSchema,
} from "./validation";
export type { MatchFormValues } from "./validation";

// Pagination
export type { PaginatedResponse } from "./pagination";

// Domain types
export type {
  FieldDiff,
  OverrideInfo,
  MatchListItem,
  MatchDetail,
  MatchDetailResponse,
  MatchFieldChange,
  MatchChangesResponse,
} from "./matches";

export type {
  BookingMatch,
  BookingListItem,
  BookingDetailTask,
  BookingDetail,
  BookingInfo,
} from "./bookings";

export type {
  TaskCardData,
  ChecklistItem,
  TaskComment,
  TaskDetail,
} from "./tasks";

export type { BoardColumnData, BoardSummary, BoardData } from "./boards";

export type {
  SyncRunSummary,
  SyncRun,
  SyncRunEntry,
  SyncStatusResponse,
  SyncRunEntriesResponse,
  SyncJobData,
  Job,
  JobsResponse,
  SyncScheduleData,
  TriggerResponse,
  LiveLogEntry,
} from "./sync";

export type { RefereeListItem } from "./referees";
export type { StandingItem, LeagueStandings } from "./standings";
export type { VenueListItem, VenueSearchResult } from "./venues";
export type { UserListItem } from "./users";
export type { NotificationItem, NotificationListResult } from "./notifications";
export type { ClubConfig, BookingSettings } from "./settings";
export { BOOKING_DEFAULTS } from "./settings";
export type {
  ResolvedLeague,
  ResolveResult,
  TrackedLeague,
  TrackedLeaguesResponse,
} from "./leagues";
```

**Step 9: Run typecheck**

Run: `pnpm --filter @dragons/shared typecheck`
Expected: PASS with no errors

**Step 10: Commit**

```
feat(shared): add remaining domain types and barrel export
```

---

### Task 8: Wire up shared package as dependency

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/web/package.json`

**Step 1: Add `@dragons/shared` to both apps**

In `apps/api/package.json` add to `dependencies`:
```json
"@dragons/shared": "workspace:*"
```

In `apps/web/package.json` add to `dependencies`:
```json
"@dragons/shared": "workspace:*"
```

**Step 2: Install**

Run: `cd /Users/jn/git/dragons-all && pnpm install`

**Step 3: Verify imports work**

Run: `pnpm --filter @dragons/shared typecheck && pnpm --filter @dragons/api typecheck && pnpm --filter @dragons/web typecheck`
Expected: All PASS (no imports changed yet, just verifying the dependency graph)

**Step 4: Commit**

```
chore: add @dragons/shared dependency to api and web
```

---

### Task 9: Migrate web match types

**Files:**
- Modify: `apps/web/src/components/admin/matches/types.ts` — replace with re-exports
- Modify: all files importing from `./types` or `../matches/types` in the matches folder

**Step 1: Replace matches/types.ts**

Delete the local type definitions. Re-export shared types and keep only web-specific types (`MatchFilters`).

```typescript
// Re-export shared types
export {
  matchFormSchema,
  type MatchFormValues,
  type DiffStatus,
  type FieldDiff,
  type OverrideInfo,
  type MatchListItem,
  type MatchDetail,
  type MatchDetailResponse,
  type MatchFieldChange,
  type MatchChangesResponse,
} from "@dragons/shared";
export type { PaginatedResponse } from "@dragons/shared";

// Web-only types
export interface MatchFilters {
  teamNames?: string[];
  dateFrom?: string;
  dateTo?: string;
}

/**
 * @deprecated Use PaginatedResponse<MatchListItem> instead
 */
export type MatchListResponse = import("@dragons/shared").PaginatedResponse<
  import("@dragons/shared").MatchListItem
>;

export type { MatchFormValues as MatchUpdateData } from "@dragons/shared";
```

**Step 2: Run web typecheck**

Run: `pnpm --filter @dragons/web typecheck`

Fix any type mismatches. The key difference: `MatchDetail` no longer has `currentRemoteVersion`, `currentLocalVersion`, `lastRemoteSync`. Check match detail components for usage and remove references.

**Step 3: Commit**

```
refactor(web): migrate match types to @dragons/shared
```

---

### Task 10: Migrate web booking types

**Files:**
- Modify: `apps/web/src/components/admin/bookings/types.ts`
- Modify: files importing from this module

**Step 1: Replace bookings/types.ts**

```typescript
export type {
  BookingStatus,
  BookingMatch,
  BookingListItem,
  BookingInfo,
} from "@dragons/shared";
```

Note: The web's `BookingListItem` was a subset of the API's. The shared type matches the API's full shape. Components that use `BookingListItem` may now have additional optional fields available — this is not a breaking change.

**Step 2: Run web typecheck, fix any issues**

Run: `pnpm --filter @dragons/web typecheck`

**Step 3: Commit**

```
refactor(web): migrate booking types to @dragons/shared
```

---

### Task 11: Migrate web board and task types

**Files:**
- Modify: `apps/web/src/components/admin/board/types.ts`
- Modify: `apps/web/src/components/admin/board/task-detail-sheet.tsx` — remove inline `TaskDetail`, `ChecklistItem`, `Comment` interfaces
- Modify: `apps/web/src/components/admin/board/task-card.tsx` — use `TaskPriority` type and `TASK_PRIORITIES` constant
- Modify: `apps/web/src/components/admin/board/create-task-dialog.tsx` — use `TASK_PRIORITIES` constant

**Step 1: Replace board/types.ts**

```typescript
export type {
  BoardColumnData,
  BoardData,
  TaskCardData,
} from "@dragons/shared";
```

**Step 2: Update task-detail-sheet.tsx**

Remove inline interfaces (lines 41-59) and import from shared:
```typescript
import type { TaskDetail, ChecklistItem, TaskComment, TaskCardData, BookingInfo } from "@dragons/shared";
import { TASK_PRIORITIES } from "@dragons/shared";
```

Remove the local `interface TaskDetail extends TaskCardData`, `interface ChecklistItem`, and `interface Comment`. Use `TaskComment` instead of `Comment` (avoids name collision with DOM `Comment`).

Replace hardcoded priority select items (lines 192-195) with:
```typescript
{TASK_PRIORITIES.map((p) => (
  <SelectItem key={p} value={p}>
    {t(`admin.board.priority.${p}`)}
  </SelectItem>
))}
```

**Step 3: Update task-card.tsx**

Import `TASK_PRIORITIES` and `TaskPriority` from shared. Replace the hardcoded `priorityVariant` record key type:
```typescript
import { TASK_PRIORITIES, type TaskPriority } from "@dragons/shared";

const priorityVariant: Record<TaskPriority, "default" | "secondary" | "destructive" | "outline"> = {
  low: "secondary",
  normal: "outline",
  high: "default",
  urgent: "destructive",
};
```

**Step 4: Update create-task-dialog.tsx**

Import `TASK_PRIORITIES` and use it for the default value and select items.

**Step 5: Run web typecheck**

Run: `pnpm --filter @dragons/web typecheck`

**Step 6: Commit**

```
refactor(web): migrate board/task types to @dragons/shared
```

---

### Task 12: Migrate web sync types

**Files:**
- Modify: `apps/web/src/components/admin/sync/types.ts`

**Step 1: Replace sync/types.ts**

```typescript
export type {
  SyncStatus,
  EntityType,
  EntryAction,
  SyncRunSummary,
  SyncRun,
  SyncRunEntry,
  SyncStatusResponse,
  SyncRunEntriesResponse,
  SyncJobData,
  Job,
  JobsResponse,
  SyncScheduleData,
  TriggerResponse,
  LiveLogEntry,
  MatchFieldChange,
  MatchChangesResponse,
} from "@dragons/shared";
export type { PaginatedResponse as LogsResponse } from "@dragons/shared";
```

Note: `LogsResponse` was `{ items: SyncRun[], total, limit, offset, hasMore }` which is `PaginatedResponse<SyncRun>`. Update any component using `LogsResponse` to use `PaginatedResponse<SyncRun>` directly.

**Step 2: Run web typecheck, fix sync component imports**

Run: `pnpm --filter @dragons/web typecheck`

**Step 3: Commit**

```
refactor(web): migrate sync types to @dragons/shared
```

---

### Task 13: Migrate remaining web types (referees, standings, venues, users)

**Files:**
- Modify: `apps/web/src/components/admin/referees/types.ts`
- Modify: `apps/web/src/components/admin/standings/types.ts`
- Modify: `apps/web/src/components/admin/venues/types.ts`
- Modify: `apps/web/src/components/admin/users/types.ts`

**Step 1: Replace each types.ts with re-exports**

`referees/types.ts`:
```typescript
export type { RefereeListItem } from "@dragons/shared";
export type { PaginatedResponse } from "@dragons/shared";

/** @deprecated Use PaginatedResponse<RefereeListItem> instead */
export type RefereeListResponse = import("@dragons/shared").PaginatedResponse<
  import("@dragons/shared").RefereeListItem
>;
```

`standings/types.ts`:
```typescript
export type { StandingItem, LeagueStandings } from "@dragons/shared";
```

`venues/types.ts`:
```typescript
export type { VenueListItem } from "@dragons/shared";
```

`users/types.ts`:
```typescript
export type { UserListItem } from "@dragons/shared";
```

Note: The web's `UserListItem` had `createdAt: Date` and `updatedAt: Date`. The shared type uses `string`. This should be fine since JSON responses are always strings — if any component does `instanceof Date` checks, update them.

**Step 2: Run web typecheck**

Run: `pnpm --filter @dragons/web typecheck`

**Step 3: Commit**

```
refactor(web): migrate referee, standing, venue, user types to @dragons/shared
```

---

### Task 14: Migrate API schemas to use shared validation

**Files:**
- Modify: `apps/api/src/routes/admin/match.schemas.ts`
- Modify: `apps/api/src/routes/admin/booking.schemas.ts`
- Modify: `apps/api/src/routes/admin/task.schemas.ts`
- Modify: `apps/api/src/routes/admin/sync.schemas.ts`

**Step 1: Update match.schemas.ts**

Import shared schemas and extend `matchFormSchema` with score fields:

```typescript
import { z } from "zod";
import { dateSchema, timeSchema, matchFormSchema } from "@dragons/shared";

export const matchListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(1000),
  offset: z.coerce.number().int().min(0).default(0),
  leagueId: z.coerce.number().int().positive().optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
});

export const matchIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const matchUpdateBodySchema = matchFormSchema.extend({
  homeScore: z.number().int().nullable().optional(),
  guestScore: z.number().int().nullable().optional(),
  homeHalftimeScore: z.number().int().nullable().optional(),
  guestHalftimeScore: z.number().int().nullable().optional(),
  homeQ1: z.number().int().nullable().optional(),
  guestQ1: z.number().int().nullable().optional(),
  homeQ2: z.number().int().nullable().optional(),
  guestQ2: z.number().int().nullable().optional(),
  homeQ3: z.number().int().nullable().optional(),
  guestQ3: z.number().int().nullable().optional(),
  homeQ4: z.number().int().nullable().optional(),
  guestQ4: z.number().int().nullable().optional(),
  homeOt1: z.number().int().nullable().optional(),
  guestOt1: z.number().int().nullable().optional(),
  homeOt2: z.number().int().nullable().optional(),
  guestOt2: z.number().int().nullable().optional(),
  changeReason: z.string().optional(),
});

export const releaseOverrideParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  fieldName: z.string().min(1).max(100),
});

export type MatchListQuery = z.infer<typeof matchListQuerySchema>;
export type MatchUpdateBody = z.infer<typeof matchUpdateBodySchema>;
```

**Step 2: Update booking.schemas.ts**

```typescript
import { z } from "zod";
import { dateSchema, timeSchema, bookingStatusSchema } from "@dragons/shared";

export const bookingIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const bookingListQuerySchema = z.object({
  status: bookingStatusSchema.optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
});

export const bookingUpdateBodySchema = z.object({
  overrideStartTime: timeSchema.nullable().optional(),
  overrideEndTime: timeSchema.nullable().optional(),
  overrideReason: z.string().max(500).nullable().optional(),
  status: bookingStatusSchema.optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const bookingStatusBodySchema = z.object({
  status: bookingStatusSchema,
});

export type BookingUpdateBody = z.infer<typeof bookingUpdateBodySchema>;
export type BookingStatusBody = z.infer<typeof bookingStatusBodySchema>;
```

**Step 3: Update task.schemas.ts**

Replace hardcoded `z.enum(["low", "normal", "high", "urgent"])` (appears 3 times) with `taskPrioritySchema`:

```typescript
import { z } from "zod";
import { dateSchema, taskPrioritySchema } from "@dragons/shared";
```

Then replace all 3 occurrences of `z.enum(["low", "normal", "high", "urgent"])` with `taskPrioritySchema`, and all date regex patterns with `dateSchema`.

**Step 4: Update sync.schemas.ts**

Import `ENTITY_TYPES` and `ENTRY_ACTIONS` from shared:

```typescript
import { z } from "zod";
import { ENTITY_TYPES, ENTRY_ACTIONS } from "@dragons/shared";

const syncRunStatusEnum = z.enum(["running", "completed", "failed"]);
const entityTypeEnum = z.enum(ENTITY_TYPES);
const entryActionEnum = z.enum(ENTRY_ACTIONS);
```

**Step 5: Run API typecheck**

Run: `pnpm --filter @dragons/api typecheck`

**Step 6: Run API tests**

Run: `pnpm --filter @dragons/api test`

**Step 7: Commit**

```
refactor(api): migrate schemas to use @dragons/shared validation
```

---

### Task 15: Migrate API service types — no-date services

Services without Date fields. Direct type replacement.

**Files:**
- Modify: `apps/api/src/services/admin/standings-admin.service.ts`
- Modify: `apps/api/src/services/admin/venue-admin.service.ts`
- Modify: `apps/api/src/services/admin/settings.service.ts`
- Modify: `apps/api/src/services/admin/league-discovery.service.ts`

**Step 1: Update standings-admin.service.ts**

Remove local `StandingItem` and `LeagueStandings` interfaces. Import from shared:
```typescript
import type { StandingItem, LeagueStandings } from "@dragons/shared";
```

**Step 2: Update venue-admin.service.ts**

Remove local `VenueSearchResult` and `VenueListItem` interfaces. Import from shared:
```typescript
import type { VenueSearchResult, VenueListItem } from "@dragons/shared";
```

**Step 3: Update settings.service.ts**

Remove local `ClubConfig` and `BookingSettings` interfaces and `BOOKING_DEFAULTS` constant. Import from shared:
```typescript
import type { ClubConfig, BookingSettings } from "@dragons/shared";
import { BOOKING_DEFAULTS } from "@dragons/shared";
```

**Step 4: Update league-discovery.service.ts**

Remove local `ResolvedLeague`, `ResolveResult`, `TrackedLeague`, `TrackedLeaguesResponse` interfaces. Import from shared:
```typescript
import type {
  ResolvedLeague,
  ResolveResult,
  TrackedLeague,
  TrackedLeaguesResponse,
} from "@dragons/shared";
```

**Step 5: Run API typecheck and tests**

Run: `pnpm --filter @dragons/api typecheck && pnpm --filter @dragons/api test`

**Step 6: Commit**

```
refactor(api): migrate standings, venue, settings, league services to shared types
```

---

### Task 16: Migrate API service types — date-converting services

Services with Date fields. Replace interfaces and add `.toISOString()` conversions.

**Files:**
- Modify: `apps/api/src/services/admin/match-query.service.ts`
- Modify: `apps/api/src/services/admin/match-diff.service.ts`
- Modify: `apps/api/src/services/admin/match-admin.service.ts`
- Modify: `apps/api/src/services/admin/referee-admin.service.ts`
- Modify: `apps/api/src/services/admin/board.service.ts`
- Modify: `apps/api/src/services/admin/notification-admin.service.ts`
- Modify: `apps/api/src/services/admin/booking-admin.service.ts`
- Modify: `apps/api/src/services/admin/task.service.ts`
- Modify: corresponding test files for each service

**Step 1: Update match-diff.service.ts**

Remove local `DiffStatus` type and `FieldDiff` interface. Import from shared:
```typescript
import type { DiffStatus, FieldDiff } from "@dragons/shared";
```

Keep `OVERRIDABLE_FIELDS`, `LOCAL_ONLY_FIELDS`, `OverridableField`, `LocalOnlyField`, `AllEditableField`, `DiffInput` — these are API-internal.

**Step 2: Update match-query.service.ts**

Remove local `OverrideInfo`, `MatchListItem`, `MatchDetail`, `MatchDetailResponse` interfaces. Import from shared:
```typescript
import type {
  OverrideInfo,
  MatchListItem,
  MatchDetail,
  MatchDetailResponse,
  FieldDiff,
} from "@dragons/shared";
```

Keep `TransactionClient`, `MatchListParams`, `MatchUpdateData`, `MatchRow` — these are API-internal.

Add date conversion in `formatMatchDetail()` or wherever the query result is assembled:
```typescript
createdAt: row.createdAt.toISOString(),
updatedAt: row.updatedAt.toISOString(),
```

For override `createdAt`:
```typescript
overrides: overrideRows.map((o) => ({
  ...o,
  createdAt: o.createdAt.toISOString(),
})),
```

Remove `lastRemoteSync` from the returned object (excluded from shared type).

**Step 3: Update match-admin.service.ts**

Update re-exports to point to `@dragons/shared` instead of local service modules for shared types.

**Step 4: Update referee-admin.service.ts**

Remove local `RefereeListItem` and `RefereeListResponse` interfaces. Import from shared:
```typescript
import type { RefereeListItem, PaginatedResponse } from "@dragons/shared";
```

Change return type from `RefereeListResponse` to `PaginatedResponse<RefereeListItem>`.

Add date conversion:
```typescript
items: rows.map((r) => ({
  ...r,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
})),
```

Keep `RefereeListParams` — API-internal.

**Step 5: Update board.service.ts**

Remove local `BoardSummary` and `BoardWithColumns`. Import shared types:
```typescript
import type { BoardSummary, BoardData } from "@dragons/shared";
```

Note: `BoardWithColumns` is renamed to `BoardData` in shared. Update function return types and add date conversion.

**Step 6: Update notification-admin.service.ts**

Remove local `NotificationItem` and `NotificationListResult`. Import from shared:
```typescript
import type { NotificationItem, NotificationListResult } from "@dragons/shared";
```

Add date conversion for `sentAt` and `createdAt`.

**Step 7: Update booking-admin.service.ts**

Remove local `BookingListItem`, `BookingDetail`, `BookingDetailMatch`, `BookingDetailTask`. Import from shared:
```typescript
import type {
  BookingListItem,
  BookingDetail,
  BookingMatch,
  BookingDetailTask,
  BookingInfo,
} from "@dragons/shared";
```

Note: `BookingDetailMatch` is renamed to `BookingMatch` in shared. Update references.

Add date conversion for `confirmedAt`, `createdAt`, `updatedAt` in detail query.

Keep `BookingListFilters`, `BookingUpdateData` — API-internal.

**Step 8: Update task.service.ts**

Remove local `TaskSummary`, `TaskDetailBookingMatch`, `TaskDetailBooking`, `TaskDetail`. Import from shared:
```typescript
import type {
  TaskCardData,
  TaskDetail,
  ChecklistItem,
  TaskComment,
  BookingInfo,
} from "@dragons/shared";
```

Note: `TaskSummary` becomes `TaskCardData` (same shape). `TaskDetailBookingMatch` becomes `BookingMatch`. `TaskDetailBooking` becomes `BookingInfo`.

Add date conversions for `createdAt`, `updatedAt`, `checkedAt`, comment timestamps.

Keep `TaskFilters` — API-internal.

**Step 9: Update all corresponding test files**

For each service test, update assertions that check Date fields to expect ISO strings instead:

```typescript
// Before:
expect(result.createdAt).toBeInstanceOf(Date);

// After:
expect(typeof result.createdAt).toBe("string");
expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
```

**Step 10: Run API typecheck and tests**

Run: `pnpm --filter @dragons/api typecheck && pnpm --filter @dragons/api test`
Expected: All pass

**Step 11: Commit**

```
refactor(api): migrate services to shared types with date serialization
```

---

### Task 17: Final verification

**Step 1: Full monorepo typecheck**

Run: `pnpm typecheck`
Expected: All packages pass

**Step 2: Full test suite**

Run: `pnpm test`
Expected: All pass

**Step 3: Full lint**

Run: `pnpm lint`
Expected: No errors

**Step 4: Commit any remaining fixes**

---

### Task 18: Update AGENTS.md and documentation

**Files:**
- Modify: `AGENTS.md` — add `@dragons/shared` to the package list and document its purpose
- Modify: `CLAUDE.md` — add shared package to the monorepo structure

**Step 1: Update monorepo structure in both docs**

Add to the structure table:
```
packages/shared  @dragons/shared  Shared types, constants, and validation schemas
```

**Step 2: Commit**

```
docs: add @dragons/shared to architecture documentation
```
