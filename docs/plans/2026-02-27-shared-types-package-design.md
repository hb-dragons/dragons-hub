# Shared Types Package Design

## Problem

The web and API projects independently define the same types, enums, constants, and validation schemas. ~40 type definitions are duplicated across both apps with no shared contract. Enum values like task priorities and booking statuses are hardcoded in 3-7 locations. Regex patterns for date/time validation appear 7+ times. When the API changes a response shape, the web types silently go stale.

## Solution

Create `@dragons/shared` (`packages/shared/`) — a pure types + constants + Zod schemas package. Both apps import from it. No runtime dependencies beyond Zod.

## Package Structure

```
packages/shared/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts           # barrel export
    ├── constants.ts       # enums as const arrays + derived types
    ├── validation.ts      # shared Zod schemas (date, time, enums, match form)
    ├── pagination.ts      # PaginatedResponse<T>
    ├── matches.ts         # MatchListItem, MatchDetail, FieldDiff, OverrideInfo
    ├── bookings.ts        # BookingListItem, BookingDetail, BookingMatch
    ├── tasks.ts           # TaskCardData, TaskDetail, ChecklistItem, Comment
    ├── boards.ts          # BoardData, BoardColumnData, BoardSummary
    ├── sync.ts            # SyncRun, SyncRunEntry, SyncStatusResponse, etc.
    ├── referees.ts        # RefereeListItem
    ├── standings.ts       # StandingItem, LeagueStandings
    ├── venues.ts          # VenueListItem, VenueSearchResult
    ├── users.ts           # UserListItem
    ├── notifications.ts   # NotificationItem, NotificationListResult
    ├── settings.ts        # ClubConfig, BookingSettings
    └── leagues.ts         # ResolvedLeague, TrackedLeague, etc.
```

## Design Decisions

### 1. Constants derive types from arrays

```typescript
export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
```

Single source for both runtime iteration (dropdowns, filters) and compile-time type safety.

### 2. All date/time fields use `string`

JSON serialization converts `Date` to `string`. Shared types reflect what actually crosses the wire. API services explicitly convert dates with `.toISOString()`.

### 3. Generic pagination replaces per-domain wrappers

```typescript
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
```

Replaces `MatchListResponse`, `RefereeListResponse`, `LogsResponse`, `SyncRunEntriesResponse`.

### 4. Shared Zod building blocks

`dateSchema`, `timeSchema`, `bookingStatusSchema`, `taskPrioritySchema`, `matchFormSchema`. The API extends these for its own needs (e.g., `matchFormSchema.extend({ scores... })`).

### 5. DB internals excluded

Fields excluded from shared types:
- `dataHash`, `remoteDataHash` — sync change detection
- `currentRemoteVersion`, `currentLocalVersion` — sync versioning
- `lastRemoteSync` — sync timestamp

Fields kept (part of the API contract):
- `id` — resource identifier used in REST URLs
- `createdAt`, `updatedAt` — exposed in detail views
- FK references (`leagueId`, `venueId`, `boardId`, `columnId`) — used for filtering and relationships

### 6. Inline types consolidated

Types currently scattered in component files (e.g., `TaskDetail`, `ChecklistItem`, `Comment` in `task-detail-sheet.tsx`) move to the shared package.

## Migration Impact

### Web (apps/web)
- All 8 `components/admin/*/types.ts` files replaced with imports from `@dragons/shared`
- `matchFormSchema` Zod schema moves from `matches/types.ts` to shared
- Inline types in `task-detail-sheet.tsx` replaced with imports

### API (apps/api)
- Service files import response types from `@dragons/shared` instead of defining their own
- Schema files import `dateSchema`, `timeSchema`, enum schemas from shared
- Services convert `Date` objects to ISO strings to conform to shared types
- `matchUpdateBodySchema` extends the shared `matchFormSchema`

### Net Result
- ~40 duplicate type definitions eliminated
- All enums centralized (priority, booking status, sync status, entity type, entry action, diff status)
- Regex patterns defined once (date, time)
- Single API contract between frontend and backend
