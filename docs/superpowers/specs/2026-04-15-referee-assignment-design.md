# Referee Assignment Design

**Date:** 2026-04-15
**Branch:** feat/referee-notifications
**Status:** Approved

## Overview

Enable two assignment flows against the Basketball-Bund federation API:

1. **Self-assign** — a logged-in referee takes an open slot on a game they qualify for
2. **Admin assign** — an admin selects a referee from federation candidates and assigns them to a game
3. **Admin unassign** — an admin removes a referee from a slot (v1 only; referee-initiated unassignment is out of scope)

Architecture: Thin proxy (Approach A). Federation is source of truth for qualifications. Local state is optimistically updated on success and confirmed by the next sync run.

---

## Federation API

All calls use the club coordinator account (`SDK_USERNAME` / `SDK_PASSWORD`). Same session as the existing `SdkClient`.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/rest/assignschiri/getRefs/{spielplanId}` | Search qualified referee candidates |
| POST | `/rest/assignschiri/submit/{spielplanId}` | Assign or unassign a referee |
| GET | `/rest/assignschiri/getGame/{spielplanId}` | Get current slot state (already implemented) |

### getRefs Payload

```json
{
  "spielId": 2836773,
  "textSearch": "Kianusch",
  "maxDistanz": null,
  "qmaxIds": [],
  "mode": "EINSETZBAR",
  "globalerEinsatz": false,
  "rollenIds": [1, 2, 3, 4, 5],
  "gruppenIds": [],
  "sortBy": "distance",
  "pageFrom": 0,
  "pageSize": 15
}
```

`mode: "EINSETZBAR"` filters for qualified candidates only. The response `results[]` objects are passed through directly as the `ansetzen` field in submit.

### Submit — Assign

```json
{
  "sr1": {
    "ansetzen": { /* getRefs result object */ },
    "aufheben": null,
    "ansetzenFix": true,
    "ansetzenVerein": null,
    "aufhebenVerein": null,
    "ansetzenFuerSpiel": 0
  },
  "sr2": { "ansetzen": null, "aufheben": null, "ansetzenFix": false, "ansetzenVerein": null, "aufhebenVerein": null, "ansetzenFuerSpiel": 0 },
  "sr3": { "ansetzen": null, "aufheben": null, "ansetzenFix": false, "ansetzenVerein": null, "aufhebenVerein": null, "ansetzenFuerSpiel": 0 },
  "coa": { "ansetzen": null, "aufheben": null, "ansetzenFix": false, "ansetzenVerein": null, "aufhebenVerein": null, "ansetzenFuerSpiel": 0 },
  "kom": { "ansetzen": null, "aufheben": null, "ansetzenFix": false, "ansetzenVerein": null, "aufhebenVerein": null, "ansetzenFuerSpiel": 0 }
}
```

All 5 slots must be present. Only the target slot gets a non-null `ansetzen`. `ansetzenFix: true` = permanent assignment.

### Submit — Unassign

Same structure, but target slot has:
```json
{
  "ansetzen": null,
  "aufheben": { "typ": "AUFHEBEN", "grund": null },
  "ansetzenFix": false
}
```

### Submit Response

Returns updated game state. Check `gameInfoMessages` for `"Änderungen erfolgreich übernommen"` to confirm success. Each slot includes a `permission` object with `addSr`/`removeSr` flags.

---

## Data Flow

### Assign Flow

```
User (referee | admin)
  → POST /referee/games/:spielplanId/assign  { slotNumber, refereeApiId }
    referee-assignment.service:
      1. Check local deny rules (refereeAssignmentRules)
      2. sdkClient.searchRefereesForGame(spielplanId, refereeApiId)
         → getRefs filtered by srId — gets ansetzen payload
         → if not found: 422 NOT_QUALIFIED
      3. sdkClient.submitRefereeAssignment(spielplanId, slot, ansetzen)
         → federation validates + assigns
      4. On success:
         • upsert refereeAssignmentIntents (clickedAt = now)
         • update refereeGames slot status → "assigned", srXName, srXRefereeApiId
         • emit REFEREE_ASSIGNED domain event
      5. Return { success, slot, status, refereeName }
```

### Unassign Flow (Admin only)

```
Admin
  → DELETE /admin/referee/games/:spielplanId/assignment/:slotNumber
    referee-assignment.service:
      1. sdkClient.submitRefereeUnassignment(spielplanId, slotNumber)
      2. On success:
         • delete refereeAssignmentIntents row for this match+slot
         • update refereeGames slot status → "open", clear srXName + srXRefereeApiId
         • emit REFEREE_UNASSIGNED domain event
      3. Return { success, slot, status: "open" }
```

### Candidate Search (Admin only)

```
Admin
  → GET /admin/referee/games/:spielplanId/candidates?slotNumber=1&search=&pageFrom=0&pageSize=15
    → sdkClient.searchRefereesForGame(spielplanId, search, slotNumber, pageFrom, pageSize)
    ← { total, results: SdkRefCandidate[] }
```

---

## API Routes

### Referee Routes (role: referee | admin)

```
POST /referee/games/:spielplanId/assign
  Body:    { slotNumber: 1|2|3, refereeApiId: number }
  Guard:   resolve session.user.refereeId → referees.apiId; must match refereeApiId (or admin bypasses)
  Returns: { success: true, slot: "sr1", status: "assigned", refereeName: string }
```

### Admin Routes (role: admin)

```
GET /admin/referee/games/:spielplanId/candidates
  Query:   ?slotNumber=1&search=&pageFrom=0&pageSize=15
  Returns: { total: number, results: SdkRefCandidate[] }

POST /admin/referee/games/:spielplanId/assign
  Body:    { slotNumber: 1|2|3, refereeApiId: number }
  Returns: { success: true, slot: "sr1", status: "assigned", refereeName: string }

DELETE /admin/referee/games/:spielplanId/assignment/:slotNumber
  Returns: { success: true, slot: "sr1", status: "open" }
```

---

## New Code Units

### Create

| File | Purpose |
|------|---------|
| `packages/sdk/src/types/referee-assignment.ts` | `SdkRefCandidate`, `SdkGetRefsPayload`, `SdkGetRefsResponse`, `SdkSubmitSlotPayload`, `SdkSubmitPayload`, `SdkSubmitResponse`, `SdkAufheben` |
| `packages/shared/src/referee-assignment.ts` | `AssignRefereeBody`, `AssignRefereeResponse`, `UnassignRefereeResponse`, `CandidateSearchResponse` |
| `apps/api/src/services/referee/referee-assignment.service.ts` | `assignReferee()`, `unassignReferee()`, `searchCandidates()` |
| `apps/api/src/routes/referee/assignment.routes.ts` | Self-assign route |
| `apps/api/src/routes/admin/referee-assignment.routes.ts` | Candidate search, admin assign, unassign |
| `apps/api/src/services/referee/referee-assignment.service.test.ts` | Service unit tests |
| `apps/api/src/routes/referee/assignment.routes.test.ts` | Route integration tests |
| `apps/api/src/routes/admin/referee-assignment.routes.test.ts` | Admin route integration tests |
| `apps/web/src/components/referee/assign-game-dialog.tsx` | Confirmation dialog for self-assign |
| `apps/web/src/components/admin/referees/assign-referee-dialog.tsx` | Candidate search + select + confirm |
| `apps/web/src/components/admin/referees/unassign-referee-button.tsx` | Confirm + unassign |

### Modify

| File | Change |
|------|--------|
| `apps/api/src/services/sync/sdk-client.ts` | Add `searchRefereesForGame()`, `submitRefereeAssignment()`, `submitRefereeUnassignment()` |
| `packages/sdk/src/index.ts` | Export new types |
| `packages/shared/src/index.ts` | Export new shared types |
| `apps/api/src/app.ts` | Mount new routes |
| `apps/web/src/app/referee/games/page.tsx` | Add "Take game" button |
| `apps/web/src/app/admin/referees/games/page.tsx` | Add assign + unassign buttons |
| `AGENTS.md` | Document new endpoints |

---

## SDK Types

```typescript
// packages/sdk/src/types/referee-assignment.ts

export interface SdkRefCandidateMeta {
  schiedsrichterId: number;
  lizenzNr: number;
  heimTotal: number;
  gastTotal: number;
  total: number;
  va: number;
  eh: number;
  qmaxSr1: string | null;
  qmaxSr2: string | null;
  tnaCount: number;
  sperrvereinCount: number;
  sperrzeitenCount: number;
  qualiSr1: number;
  qualiSr2: number;
  qualiSr3: number;
  qualiCoa: number;
  qualiKom: number;
  entfernung: number;
  maxDatumBefore: number | null;
  minDatumAfter: number | null;
  anzAmTag: number;
  anzInWoche: number;
  anzImMonat: number;
}

export interface SdkRefCandidate {
  srId: number;
  vorname: string;
  nachName: string;
  email: string;
  lizenznr: number;
  strasse: string;
  plz: string;
  ort: string;
  distanceKm: string;
  qmaxSr1: string | null;
  qmaxSr2: string | null;
  warning: string[];
  meta: SdkRefCandidateMeta;
  qualiSr1: boolean;
  qualiSr2: boolean;
  qualiSr3: boolean;
  qualiCoa: boolean;
  qualiKom: boolean;
  srModusMismatchSr1: boolean;
  srModusMismatchSr2: boolean;
  ansetzungAmTag: boolean;
  blocktermin: boolean;
  zeitraumBlockiert: string | null;
  srGruppen: string[];
}

export interface SdkGetRefsPayload {
  spielId: number;
  textSearch: string | null;
  maxDistanz: number | null;
  qmaxIds: number[];
  mode: "EINSETZBAR" | "ALLE";
  globalerEinsatz: boolean;
  rollenIds: number[];
  gruppenIds: number[];
  sortBy: "distance" | "name";
  pageFrom: number;
  pageSize: number;
}

export interface SdkGetRefsResponse {
  total: number;
  results: SdkRefCandidate[];
}

export interface SdkAufheben {
  typ: "AUFHEBEN";
  grund: string | null;
}

export interface SdkSubmitSlotPayload {
  ansetzen: SdkRefCandidate | null;
  aufheben: SdkAufheben | null;
  ansetzenFix: boolean;
  ansetzenVerein: null;
  aufhebenVerein: null;
  ansetzenFuerSpiel: 0;
}

export type SdkSubmitPayload = {
  sr1: SdkSubmitSlotPayload;
  sr2: SdkSubmitSlotPayload;
  sr3: SdkSubmitSlotPayload;
  coa: SdkSubmitSlotPayload;
  kom: SdkSubmitSlotPayload;
};
```

---

## Error Handling

| Scenario | HTTP | Code |
|----------|------|------|
| Local deny rule blocks | 403 | `DENY_RULE` |
| Referee not found in getRefs | 422 | `NOT_QUALIFIED` |
| Slot already taken (race condition) | 409 | `SLOT_TAKEN` |
| Federation call fails | 502 | `FEDERATION_ERROR` |
| Referee tries to assign someone else | 403 | `FORBIDDEN` |
| spielplanId not in refereeGames | 404 | `GAME_NOT_FOUND` |

Federation errors are detected via HTTP status or missing `"Änderungen erfolgreich übernommen"` in `gameInfoMessages`.

---

## UI Behaviour

### Self-Assign (Referee)

- Referee views open games list (existing `/referee/games` page)
- Game shows "Take SR1" / "Take SR2" buttons only for open slots where the referee is qualified
- Clicking opens `AssignGameDialog`:
  - Shows game details (date, teams, venue, slot)
  - Warning: "By continuing, this assignment will be officially submitted to the federation."
  - "Cancel" / "Take game" buttons
- On confirm: POST assign → optimistic UI update (slot shows referee's name, button replaced with assigned state)
- On error: toast with error message

### Admin Assign

- Admin views referee games in admin UI
- Open slot shows "Assign referee" button
- Clicking opens `AssignRefereeDialog`:
  - Search input → GET candidates (federation search)
  - Results list shows: name, distance, qualifications, any warnings
  - Select a referee → confirm
- On confirm: POST admin assign → optimistic update

### Admin Unassign

- Assigned slot shows "Remove" button (admin only)
- `UnassignRefereeButton` shows confirmation popover
- On confirm: DELETE unassign → optimistic update (slot returns to open state)

---

## Testing

### Service Tests (`referee-assignment.service.test.ts`)

- Happy path assign: mock getRefs returns candidate, mock submit succeeds → verify DB updates + event emitted
- Deny rule blocks: local rule with `deny=true` → 403 before any federation call
- Not qualified: getRefs returns empty → 422
- Federation error: submit throws → 502, no local state change
- Unassign happy path: submit succeeds → DB cleared + event emitted

### Route Tests

- 401 when no session
- 403 when referee tries to assign different refereeApiId than their own
- 403 when non-admin hits DELETE unassign
- Happy path: correct response shape

---

## Out of Scope (v1)

- coa / kom slot assignment
- Coupled games (`gekoppelt: true`)
- Referee-initiated unassignment (admin only for now)
- Notification wiring (domain events emitted; existing notification system picks up)
- `ansetzenFix: false` (tentative assignments) — all assignments are permanent (`fix: true`)
