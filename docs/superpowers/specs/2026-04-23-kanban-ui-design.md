# Kanban UI Design

**Date:** 2026-04-23
**Context:** Follow-up to `docs/superpowers/plans/2026-04-23-kanban-base-multi-assignee.md` (merged as commit `175e0b6` on `main`). That plan delivered the backend base plus multi-assignee; the web UI was intentionally untouched beyond two one-line fixes.

## Goal

Expose every shipped kanban backend endpoint through a usable UI, and structure the components so the deferred backend features (labels, attachments, activity log, watchers, multi-checklist, archive, WIP limits, domain links, notifications wiring, bulk ops, duplicate/copy) slot in later as single-file enablements rather than refactors.

## Non-Goals

- Backend changes. Any gap found during implementation that needs a new endpoint is captured in a follow-up plan, not smuggled in here.
- Template boards, voting, custom fields — speculative Trello parity features the user has not requested.
- A dedicated mobile layout. Desktop-first, touch-compatible via @dnd-kit sensors; responsive polish is a later pass.
- End-to-end test infrastructure. The web app has no Playwright/Cypress today; this plan does not introduce it.

## Approved Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Drag-and-drop library | `@dnd-kit/core` + `@dnd-kit/sortable` |
| Board header layout | Separate toolbar row under `PageHeader` (switcher left, filter pills middle, actions right) |
| Task card layout | Compact: label-bar row, title + priority, single footer row (metadata icons left, avatar stack right) |
| Task detail surface | Modal dialog (Trello-style) with main content + right sidebar of "Add to card" buttons |
| Filter state persistence | URL search params (`?assignee=…&priority=…&q=…`) matching referee-history SSR precedent |
| Multi-select filter behavior | Server-side single-assignee filter + client-side intersection for multi-assignee |

## Architecture

Three layers cleanly separated:

1. **Page layer** (`apps/web/src/app/[locale]/admin/boards/`) — server components, session + permission gate, SSR preload of board + tasks + user list via `SWRConfig fallback`
2. **Container layer** (`apps/web/src/components/admin/board/`) — stateful client components that own SWR fetches, optimistic updates, DnD context
3. **Presentational layer** — pure components rendering cards, chips, avatars, checklists; receive extension-slot props so deferred-feature data plugs in without caller changes

**Routing:**
- `/admin/boards` — server page: list boards. If none, show empty state + "Create board" button. If one, redirect to `/admin/boards/<id>`. If many, show a board picker card grid and redirect or let user click.
- `/admin/boards/[boardId]` — server page: SSR-preload `board`, `tasks`, `users`; client takeover via `<BoardView boardId={id} />`
- `/admin/board` (singular, existing route) — permanent redirect to `/admin/boards` so any linked bookmark still works

## Component Map

### New files (`apps/web/src/components/admin/board/`)

| File | Responsibility | Consumers |
|---|---|---|
| `board-view.tsx` | Client root. Owns `useBoard`, `useBoardTasks`, `useUsers`. Hosts `DndContext`. Renders toolbar + kanban + dialogs. | page |
| `board-toolbar.tsx` | Title, board switcher, filter bar, actions menu. | board-view |
| `board-switcher.tsx` | Dropdown listing boards, "+ new board" footer. | toolbar |
| `task-filters.tsx` | Multi-assignee select, priority select, search. Reads/writes URL via `use-board-filters`. | toolbar |
| `kanban-column.tsx` | Column rendering: header with name + color + count + optional `wipLimit`, sortable task list, "+ add task" button, empty-state placeholder. Droppable + sortable via `@dnd-kit`. | kanban-board |
| `assignee-stack.tsx` | Rendered avatar pile (first 3 + `+N` badge on overflow). Pure. | task-card, task-dialog |
| `task-dialog.tsx` | Modal detail/edit view. Two-column interior: `main` (title, description, checklist, activity) + `sidebar` (action buttons). | board-view |
| `task-dialog-sidebar.tsx` | "Add to card" action rail: Members, Labels, Date, Attach, Checklist, Link, Archive, Copy. | task-dialog |
| `assignee-picker.tsx` | Combobox popover: searchable user list, multi-select, mutates via `use-assignee-mutations`. | sidebar, create-task-dialog |
| `checklist-editor.tsx` | Add / toggle / delete / reorder checklist items. Written against `Checklist[]` (synthetic wrapper today, real multi-checklist later). | task-dialog |
| `comment-thread.tsx` | Renders comments resolving `authorId` → name via `useUsers` cache. Submit input. | task-dialog |
| `create-board-dialog.tsx` | Board create form (name required, description optional). Replaces `create-board-button.tsx`. | switcher |
| `delete-confirm-dialog.tsx` | Generic `AlertDialog` wrapper used for task/column/board deletion with an "Archive instead" secondary action (disabled stub). | anywhere |

### Stub files (reserved extension points — see "Extension points" below)

| File | Reserves |
|---|---|
| `labels-picker.stub.tsx` | Board-scoped label picker |
| `labels-bar.stub.tsx` | Label bars on card header |
| `attachments-panel.stub.tsx` | Attachment upload/list |
| `activity-feed.stub.tsx` | Per-task activity feed |
| `watch-toggle.stub.tsx` | Watch/unwatch button |
| `link-picker.stub.tsx` | Match/booking link picker |
| `archive-button.stub.tsx` | Archive/restore action |

Each stub exports a default component that renders a "coming soon" popover/toast and matches the interface the real component will expose.

### Modified files

| File | Change |
|---|---|
| `apps/web/src/components/admin/board/kanban-board.tsx` | Rewrite: single `DndContext` hosting nested `SortableContext` for columns and cards. Pure render — no SWR, delegated to `board-view`. |
| `apps/web/src/components/admin/board/task-card.tsx` | Compact layout. Adds assignee stack, reserved slots for labels/attachments/comment count. |
| `apps/web/src/components/admin/board/create-task-dialog.tsx` | Add assignee picker. Update body shape to send `assigneeIds: string[]`. |
| `apps/web/src/components/admin/board/column-settings-dialog.tsx` | Already handles create + edit + delete; move color-label text from hardcoded English to i18n. |
| `apps/web/src/lib/swr-keys.ts` | Add `boards`, `boardTasks(id, filters?)`, `taskDetail(id)`, `users`. Filter-variant suffix via `toQS`. |

### Removed files

| File | Replacement |
|---|---|
| `apps/web/src/app/[locale]/admin/board/page.tsx` | Replaced by `/admin/boards/` + `/admin/boards/[boardId]/` pages; the singular route redirects. |
| `apps/web/src/components/admin/board/create-board-button.tsx` | Replaced by `create-board-dialog.tsx`. |
| `apps/web/src/components/admin/board/task-detail-sheet.tsx` | Replaced by `task-dialog.tsx`. |

### Hooks (`apps/web/src/hooks/` — matches existing `use-debounce.ts` location)

| Hook | Purpose |
|---|---|
| `use-board.ts` | `useBoard(id)`, `useBoards()`, `useBoardTasks(id, filters)` — typed SWR wrappers |
| `use-users.ts` | `useUsers()` — SWR wrapper around `authClient.admin.listUsers`, returns `Map<userId, UserShape>` |
| `use-task-mutations.ts` | `create/update/delete/move` with optimistic updaters, toast on error |
| `use-assignee-mutations.ts` | `addAssignee`, `removeAssignee` |
| `use-checklist-mutations.ts` | `add/update/delete` checklist items |
| `use-comment-mutations.ts` | `add/update/delete` comments |
| `use-column-mutations.ts` | `add/update/delete/reorder` columns + boards |
| `use-board-filters.ts` | URL-param reader/writer, typed filter state |

## Drag-and-Drop Topology

Single `DndContext` in `kanban-board.tsx` wraps the whole board. Nested `SortableContext` for columns (horizontal) and one per column for cards (vertical).

### Sensors

```ts
useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  useSensor(TouchSensor,   { activationConstraint: { delay: 150, tolerance: 5 } }),
  useSensor(KeyboardSensor,{ coordinateGetter: sortableKeyboardCoordinates }),
)
```

PointerSensor with a distance constraint prevents accidental drags on click. TouchSensor with a delay distinguishes long-press drag from scroll on mobile. KeyboardSensor gives Space-to-pick-up, arrows-to-move, Space/Enter to drop, Esc to cancel — all built in.

### Item identity

Every draggable has a prefixed id to disambiguate columns from cards in the single `DndContext`:

- `col-<id>` for columns
- `task-<id>` for cards

The `data` payload on each sortable carries `{ type: "column" | "task", id: number, columnId?: number }`. Drop handlers branch on `type`.

### Collision detection

`closestCorners` (default in @dnd-kit for grids) works best for column + card nested topology.

### Drag lifecycle

Local component state (not SWR): `const [activeId, setActiveId] = useState<string | null>(null)`.

1. **`onDragStart`** — set `activeId` so `DragOverlay` can render the ghost
2. **`onDragOver`** — if dragging a card over a different column, speculatively move the card in the client's task list so cross-column drops render in the new column immediately. This is visual only; no network call.
3. **`onDragEnd`** — compute final `{ targetColumnId, targetPosition }` via pure helper `computeDropTarget(active, over, tasks, columns)`. Fire optimistic `mutate` + `fetchAPI POST /admin/tasks/:id/move`. Server clamps and shifts; on error, revalidate.
4. **`onDragCancel`** — revalidate SWR to snap back from any in-drag speculation.

### `computeDropTarget` pure helper (lib/dnd.ts)

Given `active`, `over`, current `tasks[]`, and `columns[]`, returns `{ columnId: number, position: number }`.

Cases:
- `over.type === "column"` — card dropped on an empty column (or column header). Target = end of that column: `{ columnId: over.id, position: count(tasksIn(over.id)) }`.
- `over.type === "task"` — target column = `over.columnId`. Position:
  - Same column, dragging downward: `over.position`
  - Same column, dragging upward: `over.position`
  - Cross-column: `over.position` (array-style insertion before `over`)
- `active.type === "column"` — use `arrayMove(columns, oldIndex, newIndex)` to compute new positions; return the reorder array, not a drop target (different endpoint).

Unit-tested independently — does not require a rendered board.

### Column reorder

`onDragEnd` for `col-*` ids: compute new ordering via `arrayMove`, call `PATCH /admin/boards/:id/columns/reorder` with `{ columns: [{id, position}] }`, optimistic.

### DragOverlay

Renders a ghost of the dragged card or column that follows the cursor. The original stays in place at `opacity: 0.4` so the drop location is readable.

### Accessibility

`DndContext` gets `screenReaderInstructions` and `announcements` props in both English and German:

```
onDragStart:   "Picked up task {title}. In column {column}, position {pos} of {total}."
onDragOver:    "Now over column {column}, position {pos} of {total}."
onDragEnd:     "Dropped in column {column} at position {pos}."
onDragCancel:  "Drag cancelled."
```

Two new i18n keys per locale under `board.dnd.*`.

### Autoscroll

Enable @dnd-kit's built-in autoscroll for horizontal drags past the viewport edge. If empirically janky on touch, disable — not worth a custom solution for v1.

## State & Data Flow

### SSR preload

`app/[locale]/admin/boards/[boardId]/page.tsx`:

1. `getServerSession`; gate on `can(user, "board", "view")`
2. Parallel: `fetchAPIServer` for `/admin/boards`, `/admin/boards/:id`, `/admin/boards/:id/tasks`
3. Wrap children in `<SWRConfig fallback={...}>` with pre-seeded keys
4. Render `<BoardView boardId={id} />`

User list (`authClient.admin.listUsers`) is fetched on the client in `use-users.ts`, keyed separately. Attempting to call it server-side is possible but adds better-auth setup complexity in RSC context; defer to client fetch for v1.

### SWR key scheme

```
SWR_KEYS.boards              = "/admin/boards"
SWR_KEYS.boardDetail(id)     = `/admin/boards/${id}`
SWR_KEYS.boardTasks(id, f?)  = `/admin/boards/${id}/tasks${toQS(f)}`
SWR_KEYS.taskDetail(id)      = `/admin/tasks/${id}`
SWR_KEYS.users               = "/auth/admin/users"
```

Filter-variant task keys cache independently per filter combination. When a mutation fires, `mutate` against `boardTasks(id)` uses SWR's partial-match matcher (function predicate) to invalidate every filter-suffixed key together.

### Optimistic mutation patterns

| Action | Optimistic step | Revalidate on error |
|---|---|---|
| Create task | Append tmp row to `boardTasks`; replace with server response | `boardTasks(id)` |
| Move task (drag) | Relocate + adjust positions client-side; deterministic server result matches | `boardTasks(id)` |
| Update task | Merge fields into `boardTasks` row + `taskDetail` | both |
| Delete task | Remove from `boardTasks`; close dialog | `boardTasks(id)` |
| Add assignee | Append `{userId, name, assignedAt: now}` to `taskDetail.assignees` and card row | `taskDetail`, `boardTasks` |
| Remove assignee | Filter out from both | same |
| Toggle checklist item | Flip `isChecked` + adjust counts on card row | `taskDetail`, `boardTasks` |
| Add comment | Append `{id: tmpId, authorId: sessionUser.id, body, createdAt: now}`; replace on success | `taskDetail` |
| Reorder columns | Splice `board.columns` to new order | `boardDetail` |
| Create / update / delete column | Mutate `board.columns` in place | `boardDetail` |
| Create board | Navigate to new URL on success | `boards` |

Each mutation hook is shape-identical: `mutate(key, optimisticValue, { revalidate: false })` → `fetchAPI` → success `mutate(key, serverValue, { revalidate: false })`; error calls `mutate(key)` for a clean revalidate and fires a `sonner` toast with the server's `error` string.

### URL filter state

`use-board-filters.ts` reads `useSearchParams`, writes via `router.replace({ scroll: false })`. Shape:

```
?assignee=u_alice&assignee=u_bob&priority=urgent&q=heidelberg
```

- `assignee`: multi-value string array
- `priority`: single string (one of the `TaskPriority` values)
- `q`: single string, free-text search

Applied client-side on the SWR-fetched list:
- Single assignee → server-side filter via `?assigneeId=...` in the SWR key
- Multiple assignees → fetch without server filter, then client intersect
- Priority → client filter by equality
- `q` → client substring match on `title + description`

### Error handling

- `fetchAPI` already throws on non-2xx. Mutation hooks wrap in try/catch, toast the server's error string via `sonner`.
- 403 mid-session → redirect to `/admin` (user lost permissions, e.g. role was removed).
- 404 on task detail → close dialog, revalidate `boardTasks(id)`.

## Extension Points for Deferred Backend Features

Each deferred feature gets a **visible stub or reserved slot today**. Enablement later = one file per feature, no re-architecture.

### Labels (board-scoped, m2m)

- `task-card.tsx` renders `<LabelsBar labels={task.labels ?? []} />` above the title. Empty array → component renders nothing.
- `task-dialog-sidebar.tsx` "Labels" button opens `<LabelsPicker>` stub that shows "Labels coming soon". Replace stub with real picker when backend ships.
- `task-filters.tsx` reserves a `<LabelFilter />` slot behind a `LABELS_ENABLED` const (off until backend).

### Attachments

- `task-card.tsx` reserves a `📎 {task.attachmentCount}` icon when `attachmentCount > 0` (optional field on `TaskCardData`).
- `task-dialog-sidebar.tsx` "Attach" button opens `<AttachmentsPanel>` stub.

### Activity log

- `task-dialog.tsx` renders `<ActivityFeed taskId={taskId} />`. Stub returns `null`. When endpoint lands, replace with real feed.
- Mutation hooks call a local `recordClientActivity({ event, taskId })` no-op; when backend auto-records activity from mutations, delete the helper. When backend exposes a manual activity endpoint (unlikely), swap the no-op.

### Watchers

- `task-dialog-sidebar.tsx` "Watch" toggle component is stubbed (no-op). Reserves the `task.isWatchedByMe: boolean` optional field shape on `TaskDetail`.

### Multi-checklist

- `checklist-editor.tsx` is written against `Checklist[]`, where `Checklist = { id, title, items: ChecklistItem[] }`.
- For v1, a synthetic adapter wraps the current single-list backend: `[{ id: 0, title: null, items: task.checklist }]`.
- When multi-checklist backend ships, swap the adapter. Zero caller change.

### Archive (board / column / task)

- `delete-confirm-dialog.tsx` shows an "Archive instead" secondary action, disabled with tooltip "Archive coming soon".
- `task-filters.tsx` reserves an "Archived" tab hidden behind a `ARCHIVE_ENABLED` const.

### Domain links (task ↔ match, task ↔ booking)

- `task-dialog-sidebar.tsx` "Link" button opens `<LinkPicker>` stub that will pick a match or booking and call `POST /admin/tasks/:id/links` when backend exists.
- `task-card.tsx` reserves a footer row for linked-entity chips (hidden when empty).
- The match detail and booking drawer getting "Linked tasks" sections is a separate follow-up — out of scope here; the card-level reservation is enough for forward compatibility.

### Notifications

- UI does not surface this directly; toasts + notification center already exist.
- Assignee/comment mutations leave anchored TODO comments (`// TODO(notifications): server fires notifyTaskAssigned`) so backend follow-up can grep + wire.

### WIP limits

- `kanban-column.tsx` header renders `{count} / {wipLimit}` when `wipLimit != null`, else just `{count}`.
- Column ring turns destructive (`ring-destructive ring-2`) when `count > wipLimit`.
- Field shape on `BoardColumnData`: optional `wipLimit: number | null`. Backend type update in a later plan.

### Bulk operations

- `kanban-board.tsx` DnD shell has a commented-out `MultipleDraggables` skeleton. Disabled for v1.
- Re-enable when bulk endpoints ship on the API.

### Duplicate / copy

- Task dialog sidebar's "Copy" action is stubbed. Single-file enablement.

### What is NOT reserved

- Template boards
- Voting
- Custom fields

These are speculative and not part of the "features left out" the user asked to future-proof.

### Stub convention

Every stub lives in a `*.stub.tsx` file exporting the default component. Two invariants:

1. A `grep -rn "coming soon" apps/web/src/components/admin/board/` produces the precise enablement checklist
2. The real component's interface (props, exports) matches the stub's so swapping is a single-file rename + reimport update

## Testing Strategy

Existing web test infra: vitest 4 + `@testing-library/jest-dom` + `@testing-library/react` (via existing `referee/history/*.test.tsx`). No global coverage threshold on `apps/web`. Match existing test density, not a numeric bar.

### What is tested

| Layer | Tests | Tools |
|---|---|---|
| Pure components (`task-card`, `assignee-stack`, labels-bar stub, activity-feed stub, column header) | Render matrix: 0/1/N assignees, with/without due date, priority colors, checklist progress states, empty-column placeholder | RTL `render` + `getByText` / `getByRole` |
| Dialogs (task, create-task, create-board, column-settings, delete-confirm) | Open/close, field validation, disabled-save-when-invalid, confirm semantics, submit dispatches correct hook | RTL + `userEvent`, mock mutation hooks |
| Popovers (assignee-picker, filter bar) | Typeahead filter, multi-select toggle, URL-param sync on change | RTL + `userEvent`, mock `useSearchParams` / `useRouter` |
| Hooks (`use-board-filters`, `use-task-mutations`, `use-assignee-mutations`, `use-users`) | Input → output; optimistic + rollback paths | `renderHook`; mock `fetchAPI`, `mutate` |
| `computeDropTarget` pure helper | 15–20 scenarios: same-col up, same-col down, cross-col to empty, cross-col to populated, column reorder, edge positions | Pure unit test |
| Filter serializer | Parses `?assignee=a&assignee=b&priority=urgent` → typed state; roundtrip | Pure unit test |
| Extension stubs | Each stub renders; click → "coming soon" toast fires | One small test per stub |

### What is explicitly NOT tested

- Real DnD interaction (pick up → move → drop) — JSDOM pointer events are brittle for `@dnd-kit`; the pure `computeDropTarget` tests cover the reasoning, and the library's internals are out of scope
- Real `authClient.admin.listUsers` — mocked at the test boundary
- Keyboard drag a11y — covered by the library; our role is correct `announcements` wiring
- SSR rendering paths — covered by manual smoke

### Manual smoke steps (required pre-merge, documented in PR body)

On `pnpm dev`:
1. Create board → redirect to new board URL; default columns present
2. Create task with 2 assignees; card shows avatar stack
3. Drag card within column, across columns, reorder columns — positions contiguous after each
4. Add/remove assignee via dialog; chip count updates on card
5. Add comment; author name renders (not raw id)
6. Apply assignee+priority filter via URL; URL updates; list filters; refresh preserves state
7. Delete task via dialog; toast fires; card disappears
8. Touch-emulate in DevTools; drag works via long-press

### Quality gates before merge

- `pnpm turbo lint typecheck test` green
- `pnpm check:ai-slop` green (no banned phrases in any new prose)
- Manual smoke 1–8 green
- No new `console.log`, `.only`, or `xit` in changed files

## File Delta Summary

**New:** 14 component files + 7 stub files + 8 hook files + 2 route pages + 1 `lib/dnd.ts` helper + tests for each = ~55 new files

**Modified:** ~5 files (`kanban-board.tsx` rewrite, `task-card.tsx`, `create-task-dialog.tsx`, `column-settings-dialog.tsx`, `swr-keys.ts`)

**Removed:** 3 files (`create-board-button.tsx`, `task-detail-sheet.tsx`, `app/[locale]/admin/board/page.tsx`)

**Dependencies added:** `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` (sibling package for transform helpers)

## Rollout

One PR. Estimated complexity: a week of focused work for one developer; on the high end of "single plan" scope but still coherent — the whole thing is the kanban UI. Attempting to split across multiple PRs produces either an unstylable half-board or a dead component tree, both worse than a single merge.

Reviewer walk-through path (written into the PR body):

1. `lib/dnd.ts` + tests — pure functions, fastest to verify
2. `hooks/*` — mutation layer, mockable
3. `components/admin/board/board-view.tsx` — container wiring
4. `kanban-board.tsx` + `kanban-column.tsx` — DnD canvas
5. `task-card.tsx` + `task-dialog.tsx` — the rest is rendering

## Open Questions

None. All decisions captured in "Approved Decisions" above.
