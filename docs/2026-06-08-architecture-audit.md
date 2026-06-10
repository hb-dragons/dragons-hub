# Architecture & data audit — 2026-06-08

In-depth review of the dragons-all monorepo (web + native + api + db + shared packages)
ahead of continued feature work. Produced by a multi-agent audit (10 area deep-reads +
adversarial verification of every high-severity finding + cross-cutting synthesis), with
the highest-impact claims spot-checked by hand.

**Totals:** 107 verified findings — 21 high, 47 medium, 39 low. Full list in the appendix.

## Bottom line

The bones are good; the seams are where the debt lives. The hard, rare-to-get-right pieces
are genuinely well-built — a correct transactional outbox + BullMQ topology, sound match
versioning, a client-agnostic `api-client`, hash-based change detection, a shared RBAC
catalog, real SSE/pub-sub for the scoreboard. The database is the most production-ready layer.

But the platform is not currently set up to *grow* cleanly, because the debt concentrates at
the extension points touched most: cross-client contracts, the role/surface catalog, the sync
orchestrator, and notification payloads. Several of those seams are broken in production right
now — including the single most important mobile flow (referee push).

The investment is also inverted: ~162 test files and 90/95 coverage on `apps/api`, but zero
tests, no real lint, and weaker type-strictness on `apps/native` — the priority client.

## What is genuinely good (do not break these)

- **Transactional outbox done correctly** — `publishDomainEvent` inserts the event in the
  caller's tx; the poller uses `FOR UPDATE SKIP LOCKED` with a commit-delay guard
  (`event-publisher.ts`, `outbox-poller.ts`).
- **Match versioning** — separate remote/local tracks, `(matchId, versionNumber)` uniques,
  field-level `match_changes` audit, typed legacy/current snapshot union with a discriminator
  (`versions.ts`).
- **`@dragons/api-client`** — injectable fetch/auth/onResponse, no React/platform coupling,
  unit-tested. The right shape for two clients.
- **Hash change-detection** — keys sorted before hashing, volatile fields excluded, two-stage
  "hash moved then compute effective changes" guard (`hash.ts`, `matches.sync.ts`).
- **Type-safety hygiene** — across ~117k lines: only 4 `: any`, most `as unknown as` confined
  to the SDK boundary; zero TODO/FIXME and almost no `console.log`.
- **Role-aware shell (this branch)** — gating lives in shared tested pure functions; native is
  a thin presentation overlay. This refactor is the right pattern.
- **Web is server-component-first** with SWR hydration via `SWRConfig` fallback keys (no client
  waterfalls) and `getServerSession` wrapped in React `cache()`.

## Shipping broken right now (fix before any new feature)

Verified live bugs/risks, not style nits:

1. **Every referee push notification is garbage.** The template expects
   `matchId/slot/kickoffDate/kickoffTime/eventId`; the event carries none of them, so the body
   renders "als undefined ... am undefined um undefined", the deep link is
   `/referee-game/undefined`, and `formatDe(undefined)` throws (caught, then every device is
   logged as failed). Same for unassigned/reassigned. This is the core value of the priority
   app. — `templates/push/referee-assigned.ts:5-25` vs `domain-event-schemas.ts:110-117`
2. **The in-app inbox returns zero rows for normal users.** Filters `eq(recipientId, userId)`
   but the pipeline writes prefixed IDs (`user:<id>`, `referee:42`, `audience:admin`). The same
   routes take `userId` from the query string (an IDOR). — `notification-admin.service.ts:48`
3. **Native column-reorder returns 400** while web works: `api-client.reorderColumns` sends
   `{order}`, the API requires `{columns}` — and the test asserts the wrong shape, locking the
   bug in. — `api-client/src/endpoints/admin-board.ts:99-102`, `board.schemas.ts:44-53`
4. **Manual referee assignments send no notification** (only sync-driven ones do): `role-defaults`
   reads `payload.refereeId`, absent from the schema and the manual emit path. —
   `role-defaults.ts:91`, `referee-assignment.service.ts:180`
5. **Duplicate push and WhatsApp sends.** At-least-once delivery, but push calls Expo before the
   dedup insert, and WhatsApp never writes `notification_log` at all (no dedup, no audit). —
   `channels/push.ts:104-123`, `channels/whatsapp-group.ts:8-41`
6. **High-urgency match events can be silently lost.** `match.*`/`match.created` are published
   outside the row transaction, so a crash between commit and event-insert drops exactly the
   cancellation/venue-change alerts.
7. **The security overrides are dead.** The entire `pnpm.overrides` block lives in
   `package.json`, which pnpm 11 no longer reads (the lockfile has zero overrides; vulnerable
   `tar`/`minimatch`/`postcss` survive their pins). Move it to `pnpm-workspace.yaml`. —
   `package.json:25-45`
8. **2.4 MB of real referee PII committed and unused.** `seed.json` has real names + license
   numbers for 261 referees; its loader was never written. — `apps/api/src/test/fixtures/seed.json`
9. **Two auth users can claim one referee.** `user.refereeId` has no unique constraint. —
   `schema/auth.ts:14`

## The systemic root causes

These themes explain the bulk of the findings.

### 1. Hand-maintained parallel contracts with no single source of truth (the master problem)

Nearly every typed boundary is duplicated by hand and the copies have already drifted into the
bugs above. A request body is declared in the API's zod schema AND in an `api-client` interface
AND as a `@dragons/shared` response type AND in a push-payload interface — with nothing forcing
them to agree. The validation stack that would centralize this (`@hono/standard-validator`) is
declared but never imported, and `describeRoute` carries zero request/response schemas, so the
OpenAPI spec is prose-only and cannot generate the client. Every new endpoint multiplies the
number of hand-synced copies.

Fix this first: either wire `zValidator` + `resolver()` so the spec is real and generate the
client from it, or export the API's zod / `z.infer` types and have `api-client` consume them.
Add a contract test that runs each client body against the matching API schema (would have
caught bug 3).

### 2. Two clients that both matter diverge at every shared mechanism

Web routes 68 files through its own `fetchAPI` and only 11 through `@dragons/api-client` (with a
second duplicate `APIError` class) — so the package built to unify the clients is used by one of
them. The same pattern repeats for design tokens (native `theme/colors.ts` is a hand-copy of web
`globals.css`), i18n (next-intl vs i18n-js — 1053 web keys / 314 native, ~15 shared), "today"
(web anchors Europe/Berlin; native uses three different timezone-unsafe strategies, and even the
web dashboard uses UTC), and the RBAC engine (API enforces via better-auth `userHasPermission`;
clients use hand-rolled `can()` — they disagree on whitespace-trimming the multi-role string and
on session freshness). Root cause: shared mechanisms get built but adoption is never enforced
(no lint rule, no contract test, no type exhaustiveness).

### 3. Data integrity enforced by erasable TypeScript, not the database

Closed-set values are bare `text`/`varchar` whose validity lives only in `.$type<>` casts, so
any path that bypasses TS (sync, the Pi, admin SQL, a second client) writes garbage that breaks
filters. The core SR query filters `sr1_status='open'` against an unconstrained column;
`period_format`, `venue_bookings.status`, `domain_events.urgency/entity_type`,
`notification_log.status` are all unconstrained. `user.role` is a comma-joined free-text column
(a typo silently strips a user's powers). `domain_events.entity_id` is a single int that cannot
reference the text-keyed scoreboard/broadcast entities.

### 4. The priority client has the weakest guardrails

`apps/native`: 0 tests, no `test`/`build`/`coverage` script (so `turbo` skips it — CI only
typechecks it), and it is the one package that does not extend `tsconfig.base` (missing
`noUncheckedIndexedAccess` etc.) — while the dead `apps/mobile` does. "lint" is `tsc --noEmit`
in 8 of 9 packages (only web runs real ESLint). Coverage thresholds are enforced for `apps/api`
only, despite CLAUDE.md presenting them as project-wide.

## Organized by category

### Bad data schemas

- `role` as comma-separated free text, no FK/CHECK (`schema/auth.ts:10`).
- Enums as bare varchar everywhere — `referee_games.sr1_status`, `matches.period_format`,
  booking status, event urgency. Promote stable high-traffic ones to `pgEnum`/`CHECK`.
- Three production indexes exist only in raw SQL migrations, invisible to the Drizzle schema
  (outbox partial index, the COALESCE notification-dedup unique, `referee_games_status_kickoff`).
  Next `drizzle-kit generate` may try to drop them; they are correctness-load-bearing.
- `referee_games` is a near-total denormalized copy of `matches` + team/venue/league data.
- 24 fixed period-score columns plus two incompatible JSONB snapshot formats kept alive forever
  ("NOT migrated — read logic must handle both"). — `matches.ts:52-73`, `versions.ts:86-161`
- `user.refereeId` not unique; no `memberId`/members table though `rbac.ts` ships
  `isMember()`/`memberId` (dead code referencing nothing).
- Orphaned legacy `notifications` table + `userNotificationPreferences.whatsapp*` columns.
- `scoreboard_snapshots` grows unbounded — no retention/pruning.
- FKs target external ids (`matches.homeTeamApiId` references `teams.apiTeamPermanentId`) rather
  than serial PKs — workable but unusual; confirm it is intentional.
- `audience:admin` is one shared in-app row, so read-state is global across all admins.

### Bad project layout

- Two mobile apps. `apps/mobile` (Capacitor) is dead, still a workspace member shipping
  committed `android/`+`ios/` trees, and is the sole reason for the 14-CVE `ignoreGhsas`
  suppression list. Delete it.
- Dead security/PII weight masks real debt — dead `pnpm.overrides` (item 7), unused 2.4 MB PII
  seed (item 8).
- `@dragons/shared` is a junk-drawer — JSX social-template components (React peerDep) + zod
  schemas + better-auth RBAC + DnD algorithms + nav config + the SDK dep, behind a 243-line
  `export *` barrel. The API only wants zod/types but transitively pulls `react`/`better-auth`.
  Split along consumption boundaries.
- Raw federation SDK shapes leak through shared into both client UIs.
- Pervasive doc drift — CLAUDE.md/AGENTS.md/README describe an obsolete 6-package workspace
  (no `api-client`/`native`/`mobile`/`pi`); the AGENTS.md endpoint table, data-model section, and
  frontend section reference dropped constraints/columns, a `middleware.ts` that is now
  `proxy.ts`, and files that do not exist. Generate these tables so they cannot drift again.
- `apps/pi` has no source — document it as a non-Node deploy target.

### Bad design / architecture decisions

- Inconsistent route layering — `match`/`board` routes are exemplary thin controllers, but
  `broadcast.routes` re-implements own-club filtering in ~75 lines of inline Drizzle,
  `notification-test.routes` runs 213 lines of rate-limit + Expo + DB inline, and
  scoreboard/device/referee-eligible routes hit the DB directly.
- `fullSync` is a 300-line god function that computes record totals twice by hand (drift risk)
  and forces edits in ~6 places per new entity. AGENTS.md calls it a "SyncOrchestrator" class;
  it is a free function. Extract a `SyncTally` + step-registry.
- Sync emits notifications inline, coupling the sync layer to notifications (the outbox exists
  precisely to avoid this).
- No dead-letter handling — failed events re-claim every 30s forever with only a log line;
  `retryFailedNotification` flips status to "sent" without re-sending.
- Two RBAC engines that disagree; permission granularity too coarse to express the platform's own
  roles (broadcast/social/notifications all gated on `settings:view`).
- Booking reconciliation: per-group N+1 with no transaction, plus a divergent second
  implementation vs `previewReconciliation`. — `venue-booking.service.ts:359-543`
- Catalog growth is not type-enforced — `SURFACES` lists 17 ids; each client re-declares an
  id-to-presentation map and silently drops unknown ids (native ports only 2 of 17).

### Bad code style / quality gates

- No real linter outside web (8/9 packages alias `lint` to `tsc`). Add a shared flat ESLint
  config; split `lint` from `typecheck` in turbo.
- Coverage gate on `apps/api` only; native untested; web thinly tested with several near-trivial
  tests.
- `match-edit-sheet.tsx` is a 1040-line god-component (also `event-browser.tsx` 658,
  `watch-rules-list.tsx` 604).
- Three coexisting error-handling patterns in the API, including stringly-typed domain errors and
  `status as never` casts.
- Heavy per-channel template duplication — in-app and push re-encode the same events
  independently.
- Raw SQL string-concat IN-list in the outbox poller (use Drizzle `inArray`); full-table scan of
  preferences on every event.
- Web: dashboard "today" uses UTC instead of Europe/Berlin (`admin/page.tsx:13`,
  `dashboard-view.tsx:39`); no `loading.tsx`/Suspense anywhere; `referees/page.tsx` does
  sequential awaits instead of `Promise.allSettled`.

### Not problems (verified, do not "fix")

- `admin/board/page.tsx` is a 5-line `redirect()` to `/admin/boards` (legacy alias), not a
  parallel implementation. Add a one-line comment or drop it.
- web `components/ui` is TanStack-table wrappers composing `@dragons/ui`'s `Table`, not a shadcn
  copy. Leave as-is.

## Area health at a glance

| Area | Verdict |
|---|---|
| DB / data model | Strongest layer; stringly-typed enums + migration-only indexes + orphans the main gaps |
| API architecture | Good outbox/RBAC primitives; uneven layering & unused validation stack |
| Sync & events | Excellent primitives applied inconsistently (god-function, inline notifications) |
| Notifications | Well-layered but wrong end-to-end where it matters (push, inbox, dedup) |
| RBAC / auth | Good shared catalog; two divergent engines + stringly-typed roles |
| Shared / api-client | Right idea; junk-drawer packaging + drifted hand-written contracts |
| Native | Well-architected, recently refactored; least-verified surface |
| Subsystems | Spec-driven and belong here; web-only, a few real liabilities |
| Layout | Clean dependency graph; dragged down by dead weight & doc drift |
| Web | Soundest client architecturally; bespoke client + timezone bug + doc drift |
| Style / testing | Strong type hygiene; lint/coverage enforced on a minority |

## Recommended sequencing (fix foundations before features)

- **Phase 0 — stop the bleeding (days):** the "shipping broken" list above, plus the web UTC
  "today" fix. All small, independently shippable.
- **Phase 1 — one source of truth for contracts:** wire `zValidator` + `resolver()` (or export
  API zod / `z.infer` types) + a contract test. Do this before migrating web onto `api-client`,
  or web migrates onto a still-drifting contract.
- **Phase 2 — raise the floor (parallel):** native test harness + extend `tsconfig.base`; shared
  ESLint; coverage gates on web/shared/api-client. Before writing new native code.
- **Phase 3 — harden & consolidate:** stable enums to `pgEnum`/`CHECK`; pick one RBAC engine
  (+ agreement test); split `@dragons/shared`; migrate web's 68 `fetchAPI` files onto
  `api-client`.
- **Phase 4 — resume features:** native scoreboard/broadcast/social, extracting shared logic
  (FIBA rules, SSE decode, club-tz "today", tokens, i18n) the first time a second client needs
  it. Delete `apps/mobile`. Regenerate the docs.

---

# Appendix — all findings

## High severity (21)

### pnpm.overrides block in package.json is silently ignored by pnpm 11
- **Area:** layout · **Category:** security · **Effort:** small · **Confidence:** high
- **Where:** package.json:25-45, pnpm-workspace.yaml:1-12
- **Problem:** The entire `pnpm.overrides` block (18 transitive pins including security fixes for undici, tar, minimatch, postcss, fast-xml-parser, next, esbuild) lives in package.json. pnpm 11.5.1 no longer reads the `pnpm` field there — running any pnpm/knip command prints `[WARN] The "pnpm" field in package.json is no longer read by pnpm. The following keys were ignored: "pnpm.overrides"`. The settings moved to pnpm-workspace.yaml, which already has `auditConfig` but NOT an `overrides` key. So every security override is currently dead.
- **Impact:** Security debt the maintainer believes is mitigated is in fact not applied. Transitive vulnerable versions of tar/undici/minimatch/esbuild/postcss resolve unpinned. For a platform handling auth sessions and federation credentials, silently-disabled CVE pins are a real exposure.
- **Fix:** Move the `overrides` map from package.json into `pnpm-workspace.yaml` (top-level `overrides:` key, same as `auditConfig` already lives there). Re-run `pnpm install` and confirm the warning disappears and the lockfile re-pins. Then delete the `pnpm` field from package.json.

### apps/mobile (Capacitor legacy) is dead weight that forces 14 parked CVEs
- **Area:** layout · **Category:** dead-code · **Effort:** medium · **Confidence:** high
- **Where:** apps/mobile/package.json:1-25, pnpm-workspace.yaml:13-33, apps/mobile/android/, apps/mobile/ios/
- **Problem:** apps/mobile is the abandoned Capacitor shell (superseded by apps/native/Expo). It is still a pnpm workspace member (present in pnpm-lock.yaml, installs @capacitor/* 8.x + @capacitor/assets + @trapezedev/project). Its build-time tooling is the sole reason pnpm-workspace.yaml:19-33 carries an `ignoreGhsas` list of 14 advisories (tar path traversal, minimatch ReDoS, @xmldom/xmldom). The comment at pnpm-workspace.yaml:14-18 explicitly says all ignored advisories sit in apps/mobile tooling. It also ships full committed android/ and ios/ native projects (Gradle, Xcode pbxproj).
- **Impact:** Carries a large committed native-project tree and a permanent security-audit blind spot for an app nobody ships. Anyone reading the audit-ignore list cannot tell debt-that-matters from debt-parked-for-a-dead-app. Removing it deletes 14 CVE suppressions outright.
- **Fix:** Delete apps/mobile from the repo (or move to an archive branch). Remove the `ignoreGhsas` block and the `replace>minimatch`/`tar`/`@xmldom/xmldom` overrides that exist only for it. Update knip.json (the `apps/mobile/**` ignore at knip.json:37 becomes unnecessary).

### Web has two parallel HTTP-client stacks; @dragons/api-client used by only 3 of 77 call sites
- **Area:** layout · **Category:** architecture · **Effort:** large · **Confidence:** high
- **Where:** apps/web/src/lib/api.ts:1-48, apps/web/src/lib/api-client.ts:1-8, packages/api-client/src/client.ts:20-103, packages/api-client/src/errors.ts:1
- **Problem:** The shared @dragons/api-client exists and native uses it for everything, but web still routes ~74 files through its own bespoke `fetchAPI`/`fetchAPIServer` in apps/web/src/lib/api.ts and only 3 files through the shared client (apps/web/src/lib/api-client.ts). There are two separate `APIError` classes (apps/web/src/lib/api.ts:1 and packages/api-client/src/errors.ts:1) with identical shape, plus a third mock copy in a test. The typed endpoint helpers (publicEndpoints, refereeEndpoints, adminBoardEndpoints) that native consumes are almost entirely unused by web, which hand-builds URL strings and casts responses instead.
- **Impact:** Defeats the purpose of extracting api-client: the two clients drift in error handling, auth header logic, and response typing. Bug fixes (e.g. 401 handling, error-code parsing) must be made twice. New endpoints get typed once in api-client for native and re-stringly-typed for web. This is exactly the cross-client duplication the platform goal warns against.
- **Fix:** Migrate web onto @dragons/api-client + the endpoint helpers, deleting apps/web/src/lib/api.ts and its APIError. Keep only thin web-specific factories (cookie forwarding for server components) the way native keeps its 401-recovery wrapper. Make api-client the single source of endpoint typing for both clients.

### apps/native does not extend the monorepo tsconfig.base — looser strictness than every other package
- **Area:** layout · **Category:** consistency · **Effort:** medium · **Confidence:** high
- **Where:** apps/native/tsconfig.json:2, tsconfig.base.json:1-15, apps/mobile/tsconfig.json
- **Problem:** Every workspace package extends ../../tsconfig.base.json EXCEPT apps/native, which extends only `expo/tsconfig.base`. The expo base does not set `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `noFallthroughCasesInSwitch`, or `forceConsistentCasingInFileNames`. So the 15.6k-line app the maintainer cares most about typechecks under materially weaker rules than api/web/shared. Ironically the dead apps/mobile DOES extend the shared base.
- **Impact:** Array-access and switch-fallthrough bugs that the rest of the codebase catches at compile time slip through in native. Code moved between native and shared/web can compile in one and fail in the other. Undermines the strict-mode discipline CLAUDE.md mandates.
- **Fix:** Have apps/native/tsconfig.json extend both bases: `"extends": ["../../tsconfig.base.json", "expo/tsconfig.base"]` (or merge the expo-specific options inline), then fix the resulting errors. At minimum turn on noUncheckedIndexedAccess.

### apps/native has zero tests and is excluded from turbo build/test/coverage
- **Area:** layout · **Category:** testing · **Effort:** large · **Confidence:** high
- **Where:** apps/native/package.json:6-12, turbo.json:11-32, .github/workflows/ci.yml:53-107
- **Problem:** apps/native (110 files, 15.6k lines, the mobile app that matters) has no `test`, `build`, or `coverage` script — only `typecheck`/`lint` (both `tsc --noEmit`). There are 0 *.test.ts(x) files under apps/native/src. Because turbo runs scripts by name, `pnpm test`, `pnpm build`, and `pnpm coverage` all skip native entirely. CI therefore never builds or tests the native app; it only typechecks it.
- **Impact:** The primary mobile client ships with no test safety net and no CI build verification, while CLAUDE.md states 'every new feature or changed behavior MUST have corresponding tests' and coverage thresholds. The platform's most user-facing surface is the least verified.
- **Fix:** Add a vitest (or jest-expo) setup + initial tests for native business logic (push registration, 401 recovery, board mutations), add a `test` script so turbo picks it up, and add an EAS/expo prebuild or `expo export` smoke step to CI so native is at least build-verified.

### Three production indexes exist only in raw migrations, invisible to the Drizzle schema
- **Area:** db · **Category:** data-model · **Effort:** medium · **Confidence:** high
- **Where:** packages/db/drizzle/0019_outbox_partial_index.sql:1, packages/db/drizzle/0018_slippery_randall_flagg.sql:86, packages/db/drizzle/0035_referee_games_status_kickoff_index.sql:1, packages/db/src/schema/domain-events.ts:11, packages/db/src/schema/referee-games.ts:53
- **Problem:** Three indexes live only as hand-written SQL and are not declared in the Drizzle table definitions: the partial outbox index `domain_events_outbox_idx ... WHERE enqueued_at IS NULL` (0019), the COALESCE-based dedup unique index `notification_log_dedup_idx` (0018), and `referee_games_status_kickoff_idx` on `(sr1_status, sr2_status, kickoff_date)` (0035). The first two carry NOTE comments warning they must be re-added manually; the third (0035) has no such note and the schema file referee-games.ts only declares 4 indexes. Because Drizzle's source of truth omits all three, the next `drizzle-kit generate` will either try to DROP them (it sees indexes in the DB that aren't in the schema) or silently diverge.
- **Impact:** On a club platform where the outbox-pattern partial index and the notification dedup unique index are load-bearing for correctness (not just performance), an accidental drop during a routine schema change would break notification delivery or cause duplicate sends, and the referee open-slot query (the core SR feature) would table-scan. This is a maintainability landmine for anyone regenerating migrations.
- **Fix:** Express all three in the Drizzle schema. Drizzle supports partial indexes via `.where(sql\`...\`)` and expression indexes, so `domain_events_outbox_idx` and `referee_games_status_kickoff_idx` can be declared directly; the COALESCE dedup index can be modeled as a generated/expression unique index or, better, by storing a non-null `recipient_key` column defaulting to '__group__'. Until then, add a schema-vs-DB drift check to CI.

### Documented validation stack (@hono/standard-validator) is never used; OpenAPI spec carries zero request/response schemas
- **Area:** api-arch · **Category:** architecture · **Effort:** large · **Confidence:** high
- **Where:** apps/api/package.json:@hono/standard-validator (declared dep), apps/api/src/config/openapi.ts:1-40, apps/api/src/routes/admin/match.routes.ts:27-31, apps/api/src/routes/admin/board.routes.ts:35-39
- **Problem:** The task brief and dependency list say validation is done 'zod via @hono/standard-validator', but the package is never imported anywhere in src (grep for sValidator/standard-validator/resolver returns only unrelated functions). Every route instead hand-rolls schema.parse(c.req.query()) / schema.parse(await c.req.json()). Consequently describeRoute() calls only ever set description/tags/responses:{200:{description}} with NO requestBody, NO content schema, NO resolver — so the auto-generated /openapi.json and Scalar /docs expose paths with prose only and no typed contract.
- **Impact:** The native app and packages/api-client cannot consume a real OpenAPI contract (no request/response shapes), so client types must be maintained by hand and drift silently. A declared-but-unused dependency is dead weight and misleads contributors about the intended pattern. AGENTS.md line 242 advertises 'OpenAPI 3.1 spec auto-generated from route annotations' which is technically true but practically empty.
- **Fix:** Either (a) adopt @hono/standard-validator/zValidator on routes and feed the same zod schemas into describeRoute via hono-openapi's resolver() so request/response schemas land in the spec, then generate the api-client from it; or (b) remove @hono/standard-validator from package.json and update AGENTS.md/CLAUDE.md to state the actual manual-parse convention. Do not leave the dep declared-but-unused.

### Inconsistent layering: many routes embed DB queries and business logic instead of delegating to services
- **Area:** api-arch · **Category:** architecture · **Effort:** large · **Confidence:** high
- **Where:** apps/api/src/routes/admin/broadcast.routes.ts:145-221, apps/api/src/routes/admin/notification-test.routes.ts:37-213, apps/api/src/routes/admin/scoreboard.routes.ts:36-89, apps/api/src/routes/public/scoreboard.routes.ts:29-39, apps/api/src/routes/device.routes.ts:36-77, apps/api/src/routes/admin/referee-eligible-games.routes.ts:28-40
- **Problem:** Layering discipline is applied unevenly. match.routes.ts and board.routes.ts are exemplary thin controllers (parse → call service → map result). But broadcast.routes.ts GET /matches contains ~75 lines of multi-step Drizzle queries (own-club id lookup, text-filter team search, aliased joins) directly in the handler, re-implementing own-club match filtering that already lives in match-admin.service.ts. notification-test.routes.ts (213 lines) runs redis rate-limiting, Expo push orchestration, and writes to notificationLog + domainEvents inline. admin/scoreboard, public/scoreboard, device, and referee-eligible-games all run db.select/db.insert directly in routes with no service.
- **Impact:** Business logic in routes can't be unit-tested without HTTP, can't be reused by workers or other routes, and duplicates query logic (own-club filtering exists in at least two places). It makes the codebase harder for an AI agent or new contributor to navigate because 'where is the logic' depends on the route. Directly contradicts CLAUDE.md ('Business logic goes in services/').
- **Fix:** Extract the inline DB/business logic into services: a broadcast match-listing function in services/broadcast/, a test-push function in services/notifications/, a scoreboard read service for both admin and public scoreboard routes, and a device-registration service. Reuse getOwnClubMatches for the broadcast match picker instead of re-querying.

### api-client reorderColumns sends {order} but API requires {columns} — native column reorder is broken
- **Area:** shared · **Category:** consistency · **Effort:** small · **Confidence:** high
- **Where:** packages/api-client/src/endpoints/admin-board.ts:95-102, apps/api/src/routes/admin/board.schemas.ts:44-53, apps/api/src/routes/admin/board.routes.ts:172-173, apps/native/src/hooks/board/useColumnMutations.ts:61, apps/web/src/hooks/use-column-mutations.ts:75
- **Problem:** The api-client's reorderColumns wraps the payload as { order } (admin-board.ts:99-101). The API's columnReorderBodySchema requires { columns: [...] } and the route reads body.columns (board.routes.ts:173). Native calls adminBoardApi.reorderColumns (useColumnMutations.ts:61) so it ships {order} and the server rejects it with a 400 (zod: 'columns' required). Web does NOT use api-client here — it hand-builds JSON.stringify({ columns }) (use-column-mutations.ts:75), so web works and native is broken for the same operation.
- **Impact:** A core ops-kanban interaction (reordering columns) silently fails on the mobile app that the maintainer says matters most, while working on web. It is the canonical symptom of the deeper problem: request bodies are duplicated by hand in api-client with no link to the API's zod schemas.
- **Fix:** Fix the immediate mismatch (send { columns }). Longer term, export the API's board zod schemas (or z.infer types) from a shared boundary and have api-client import the inferred body types instead of re-declaring CreateTaskBody/MoveTaskBody/UpdateColumnBody, so a contract change fails typecheck instead of at runtime on one client only.

### api-client and the API both hand-maintain request/response shapes with no shared source of truth
- **Area:** shared · **Category:** data-model · **Effort:** large · **Confidence:** high
- **Where:** packages/api-client/src/endpoints/admin-board.ts:14-60, apps/api/src/routes/admin/board.schemas.ts:33-59, packages/api-client/src/endpoints/public.ts:16-26, packages/api-client/src/endpoints/devices.ts:3-9
- **Problem:** Request bodies are declared twice: api-client TS interfaces (CreateTaskBody, UpdateColumnBody, MoveTaskBody) vs the API's zod schemas (columnUpdateBodySchema, etc.) with zero compile-time link. They already disagree beyond the reorder bug: api-client UpdateColumnBody (admin-board.ts:36-40) has no `position` field, but columnUpdateBodySchema (board.schemas.ts:33-42) accepts `position`. Response types come from @dragons/shared, which is ALSO hand-written separately from the API service return types — nothing guarantees PublicTeam (public.ts:16-26) or MatchListItem matches what the route actually serializes.
- **Impact:** Every endpoint is a manually-synchronized triple (zod schema / api-client type / shared response type). Drift is invisible until runtime, and it bites the two clients differently because web often bypasses api-client. This is the structural reason the reorder bug exists and will recur.
- **Fix:** Pick one direction of truth. Either (a) export the API's zod input schemas + z.infer types and have api-client consume them, and derive response types from the route handlers' return types, or (b) generate the client from an OpenAPI/Hono RPC contract. Hono already has describeRoute in these routes — wiring hono/client (hc) or honoschema would make the client typed end-to-end and delete the hand-written endpoint files.

### Web and native run two different data layers: native uses the typed @dragons/api-client, web mostly bypasses it with a duplicate fetchAPI wrapper
- **Area:** native · **Category:** architecture · **Effort:** large · **Confidence:** high
- **Where:** packages/api-client/src/client.ts:20 (canonical typed ApiClient), packages/api-client/src/endpoints/admin-board.ts:62 (adminBoardEndpoints — typed board client), apps/native/src/lib/api.ts:36-57 (native uses ApiClient + publicEndpoints/refereeEndpoints/adminBoardEndpoints), apps/web/src/lib/api.ts:19-48 (web hand-rolls its own fetchAPI + its own APIError class), apps/web/src/hooks/use-board-mutations.ts:22 (web boards call fetchAPI("/admin/boards",{method:"POST",body:JSON.stringify(...)}) instead of adminBoardEndpoints), apps/web/src/lib/api-client.ts:1 (web imports only publicEndpoints from the shared client)
- **Problem:** The monorepo has a dedicated packages/api-client with typed endpoint helpers (publicEndpoints, refereeEndpoints, adminBoardEndpoints, deviceEndpoints). Native consumes all of them. Web imports only publicEndpoints and, for everything else (boards, referees, admin), hand-rolls fetchAPI with stringly-typed paths and JSON.stringify, plus maintains a SECOND APIError class (apps/web/src/lib/api.ts:1) that duplicates packages/api-client/src/errors.ts. The shared adminBoardEndpoints exists but web's board hooks ignore it.
- **Impact:** The two clients that "both matter" diverge at the boundary the api-client package was built to unify. Board request/response shapes are typed on native but stringly-typed on web; a backend route change can break web silently while native's compiler catches it. Two APIError classes mean `err instanceof APIError` behaves differently per client. This is exactly the cross-client duplication the package was meant to eliminate.
- **Fix:** Migrate web's board/referee/admin hooks onto the shared endpoint helpers (adminBoardEndpoints, refereeEndpoints), delete apps/web/src/lib/api.ts's duplicate APIError in favor of the one in @dragons/api-client, and reduce fetchAPI to a thin server-component-only fetcher (or drop it). Document the data layer in AGENTS.md.

### Push and WhatsApp channels send before/without dedup, so a re-enqueued event causes duplicate real-world notifications
- **Area:** sync-events · **Category:** architecture · **Effort:** medium · **Confidence:** high
- **Where:** apps/api/src/services/notifications/channels/push.ts:104-123, apps/api/src/services/notifications/channels/whatsapp-group.ts:8-41, apps/api/src/workers/queues.ts:11-16, apps/api/src/services/events/outbox-poller.ts:18-49
- **Problem:** The whole system is at-least-once: domainEventsQueue uses attempts:1 (queues.ts:13) and the outbox poller can re-claim an event if the inline enqueueDomainEvent succeeded but its `enqueuedAt` UPDATE failed (event-publisher.ts:100-119), or if releaseClaim runs after a transient failure (outbox-poller.ts:42-49). The event.worker has no idempotency guard against being handed the same eventId twice. The ONLY effective dedup is the COALESCE-based partial unique index on notification_log (notification-log.ts:13-16) combined with onConflictDoNothing. The in_app adapter (in-app.ts:9-22) and push adapter (push.ts:123) use it, but the push adapter calls Expo sendBatch FIRST (push.ts:104) and only then inserts with onConflictDoNothing — so a duplicate push is physically sent to the device before the conflict check fires. The WhatsApp adapter does a raw fetch to WAHA (whatsapp-group.ts:18) and never writes notification_log at all, so it has zero dedup and zero delivery audit trail; every re-processed event posts the group message again.
- **Impact:** Members get duplicate push notifications and duplicate WhatsApp group posts on referee assignments, match changes, and slot reminders. For a club tool whose value is timely, trustworthy alerts to players and SRs, duplicate spam erodes the exact thing the platform exists to do, and the WhatsApp gap also means no delivery record for the most public channel.
- **Fix:** Make event processing idempotent at the worker boundary: before dispatch, check/insert a per-(eventId, channelConfigId, recipient) claim row and skip if already present, OR for push, insert the notification_log rows with onConflictDoNothing BEFORE calling Expo and only send for rows that were actually inserted (returning()). For WhatsApp, write a notification_log row with the same dedup index and gate the WAHA fetch on a successful insert so re-processing is a no-op.

### fullSync is a 300-line god function mixing orchestration, aggregation arithmetic, persistence, and event emission
- **Area:** sync-events · **Category:** architecture · **Effort:** medium · **Confidence:** high
- **Where:** apps/api/src/services/sync/index.ts:50-349, apps/api/src/services/sync/index.ts:207-285
- **Problem:** fullSync owns sync-run lifecycle, step sequencing, all error accumulation, the syncRuns completion UPDATE, the full SyncResult assembly, AND the sync.completed event — and the records-processed/created/updated totals are computed twice by hand: once for the syncRuns row (index.ts:213-226) and again, identically, for the event payload (index.ts:275-285). The two copies can silently drift, and every new entity type forces edits in ~6 places (Promise.all, allErrors.push, summary, three records* sums, SyncResult). AGENTS.md (line 130) calls this a 'SyncOrchestrator' class; in reality it is one free function with no orchestrator abstraction, so the documented design and the code disagree.
- **Impact:** This is the central seam of the platform — every new synced entity (the goal explicitly lists venues, standings, teams, referees as growing concerns) must thread through this function. The duplicated totals and the hand-maintained aggregation make it error-prone and hostile to extension, and a contributor reading AGENTS.md will look for a class that doesn't exist.
- **Fix:** Extract a small SyncTally accumulator (add per-entity result, expose processed/created/updated/skipped/errors) so totals are computed once and reused for both the syncRuns row and the event payload. Consider a step-registry array ({name, run}) so adding an entity is one entry instead of edits in six spots. Update AGENTS.md to match the actual shape or rename the function.

### Push templates read payload fields the emitted events never contain
- **Area:** notifications · **Category:** data-model · **Effort:** medium · **Confidence:** high
- **Where:** apps/api/src/services/notifications/templates/push/referee-assigned.ts:5-25, apps/api/src/services/referee/referee-assignment.service.ts:180-188, apps/api/src/services/sync/referees.sync.ts:340-348, packages/shared/src/domain-event-schemas.ts:110-117
- **Problem:** renderRefereeAssignedPush expects { matchId, slot, kickoffDate, kickoffTime, eventId } but the canonical referee.assigned payload (refereeAssignmentSchema, and both emit sites) is { matchNo, homeTeam, guestTeam, refereeName, role, teamIds }. None of slot/kickoffDate/kickoffTime/matchId/eventId exist. The push body renders 'Du wurdest als undefined ... am undefined um undefined eingesetzt', the deepLink becomes /referee-game/undefined, and formatDe(undefined) throws on undefined.split — which push.ts catches and logs every device as failed. Same shape mismatch applies to referee-unassigned and referee-reassigned push templates.
- **Impact:** Every native push for the most important mobile flow (referee getting assigned/unassigned) is either garbage or fails outright. This is the core value of THE app that matters (native referee notifications).
- **Fix:** Make a single canonical RefereeAssignedPayload (include matchId, slot/role, kickoffDate, kickoffTime) shared between the emit sites, the Zod schema, the in-app template, and the push template; enrich both emit sites to populate it. Add a round-trip test that feeds the real emitted payload through renderPushTemplate.

### ChannelType taxonomy is inconsistent across shared types; 'email' is a type-level ghost channel with no adapter
- **Area:** notifications · **Category:** data-model · **Effort:** medium · **Confidence:** high
- **Where:** packages/shared/src/channel-configs.ts:3, packages/shared/src/watch-rules.ts:10, packages/db/src/schema/watch-rules.ts:16-19, apps/api/src/services/notifications/notification-pipeline.ts:350
- **Problem:** Three different channel enums disagree. ChannelConfigItem.type and ProviderAvailability use ChannelType = 'in_app'|'whatsapp_group'|'email' (has email, missing push). ChannelTarget.channel = 'in_app'|'whatsapp_group'|'push'|'email' (has both). Runtime adapters exist only for in_app, whatsapp_group, push — there is no email adapter, so any 'email' target silently falls through to 'Unknown channel type, skipping dispatch'. channel_configs.type and watch_rules.channels are plain text/jsonb with no DB enum/check constraint, so an admin can persist 'email' or a typo and notifications vanish with only a debug log.
- **Impact:** Stringly-typed channel config invites silent misconfiguration; the type system actively misleads (ProviderAvailability claims push isn't a channel and email is). Hard to reason about which channels actually work.
- **Fix:** Define one canonical Channel union in @dragons/shared (in_app, whatsapp_group, push, and email only if implemented), reuse it for ChannelType, ChannelTarget, the DB $type, and the pipeline switch. Add a Postgres CHECK constraint (or pgEnum) on channel_configs.type and validate watch_rules.channels[].channel against it. Drop 'email' until an adapter exists.

### role-defaults reads payload.refereeId which is absent on the manual assignment path and not in the schema
- **Area:** notifications · **Category:** consistency · **Effort:** small · **Confidence:** high
- **Where:** apps/api/src/services/notifications/role-defaults.ts:91-96, apps/api/src/services/referee/referee-assignment.service.ts:180-188, apps/api/src/services/sync/referees.sync.ts:346, packages/shared/src/domain-event-schemas.ts:110-117
- **Problem:** getDefaultNotificationsForEvent targets the affected referee via payload['refereeId'], but refereeAssignmentSchema has no refereeId field. The sync emit site (referees.sync.ts) does add refereeId (violating its own schema validation, which logs a warning and publishes anyway), while the manual assignment service (referee-assignment.service.ts) does not. So referee self-notifications fire for sync-driven assignments but never for manual admin assignments.
- **Impact:** Inconsistent, partially-broken referee self-notification depending on which code path assigned them. A referee assigned by an admin in the UI gets no notification; one assigned via federation sync does.
- **Fix:** Add refereeId to refereeAssignmentSchema (and unassigned) and populate it at both emit sites; or resolve the referee from entityId. Treat schema-validation warnings as failures in tests so payload drift is caught in CI.

### Booking reconciliation runs per-group N+1 queries with no wrapping transaction
- **Area:** subsystems · **Category:** architecture · **Effort:** medium · **Confidence:** high
- **Where:** apps/api/src/services/venue-booking/venue-booking.service.ts:359-543, apps/api/src/services/venue-booking/venue-booking.service.ts:366-376, apps/api/src/services/venue-booking/venue-booking.service.ts:392-401, apps/api/src/services/venue-booking/venue-booking.service.ts:547-578
- **Problem:** reconcileBookingsForMatches loops over venue+date groups and, inside the loop, issues a sequential existing-booking SELECT (366), junction sync (547 — itself another SELECT + INSERT + DELETE), count(*) checks (392/530), and deletes — none wrapped in a db.transaction. reconcileMatch (601) adds a second pre-pass loop with the same per-link query pattern. By contrast previewReconciliation (183) batch-loads bookings, junctions, match-display and venue names up front, so the two paths that compute the same diff use opposite query strategies.
- **Impact:** On post-sync reconciliation (reconcileAfterSync passes every own-club home match) this is O(groups x ~5 round-trips). More importantly, a failure mid-loop leaves bookings half-reconciled (some created/deleted, some not) with no rollback, and can emit booking.needs_reconfirmation domain events for changes that later abort — corrupting the bookings view that the platform exposes to venue managers.
- **Fix:** Wrap each group's mutations (or the whole reconcile) in db.transaction, and pre-batch the existing-booking + junction lookups the way previewReconciliation already does. Factor the shared diff logic so preview and apply share one implementation instead of two divergent ones.

### Only apps/web runs a real linter; everything else aliases lint to tsc --noEmit
- **Area:** style-testing · **Category:** code-style · **Effort:** medium · **Confidence:** high
- **Where:** apps/api/package.json ("lint":"tsc --noEmit"), apps/native/package.json ("lint":"tsc --noEmit"), packages/shared/package.json, packages/ui/package.json, apps/web/eslint.config.mjs (only real ESLint config in the repo)
- **Problem:** `pnpm lint` runs `turbo lint`, but for api, native, shared, ui, sdk, and db the `lint` script is just `tsc --noEmit` — a typecheck, not a linter. Only apps/web has an eslint.config.mjs and runs ESLint. So ~73k lines of API, 15.6k of native, and all shared/ui/sdk/db code have no lint rules at all: no no-unused-vars, no no-console, no import ordering, no exhaustive-deps, no consistent-type-imports enforcement.
- **Impact:** Style and correctness drift go uncaught everywhere except web. This is why a `console.log("deviceId", deviceId)` shipped in web (the one place with ESLint it's a different file) and why `eslint-disable` comments appear only in web — nowhere else can a lint rule even fire. As the platform grows across api/native, there is no automated guardrail on code quality.
- **Fix:** Add a shared flat ESLint config (typescript-eslint + react-hooks for native) at the repo root, give each package a real `lint: eslint .` script distinct from `typecheck: tsc --noEmit`, and split the turbo `lint` and `typecheck` tasks so both run in CI.

### Coverage thresholds are enforced for apps/api only — web, shared, and api-client have tests but no gate
- **Area:** style-testing · **Category:** testing · **Effort:** medium · **Confidence:** high
- **Where:** apps/api/vitest.config.ts:14-19 (branches 90 / functions 95 / lines 95 / statements 95), apps/web/vitest.config.ts (no coverage block), packages/shared/vitest.config.ts (no coverage block), packages/api-client/vitest.config.ts (no coverage block), turbo.json (coverage task) + root package.json ("coverage":"turbo coverage")
- **Problem:** `turbo coverage` only runs packages that define a `coverage` script. Only apps/api defines one (`vitest run --coverage`); web, native, shared, and api-client do not. So CI's coverage step (.github/workflows/ci.yml:76-77) silently exercises a single package. The documented 90/95 bar is real but covers ~28% of the testable codebase by area.
- **Impact:** Web (192 source files / 31 tests) and the shared business-logic package can lose coverage with no CI signal. The maintainer believes the repo has a 90/95 standard; in practice three of four testable packages are ungated.
- **Fix:** Add `coverage` scripts with thresholds to apps/web, packages/shared, and packages/api-client (start at current measured levels and ratchet up). Either fail CI when a testable package lacks a coverage script, or assert per-package thresholds explicitly.

### apps/native (the mobile app that matters) has zero tests and no test script
- **Area:** style-testing · **Category:** testing · **Effort:** large · **Confidence:** high
- **Where:** apps/native/package.json scripts: start/ios/android/typecheck/lint — no `test`, apps/native/src/hooks/board/useMoveTask.ts, apps/native/src/hooks/board/useBoardDrag.ts, apps/native/src/hooks/usePushRegistration.ts, apps/native/src/hooks/useBiometricLock.ts, 0 *.test.ts(x) across 102 native source files
- **Problem:** Native has 21 hooks (board drag, optimistic move/checklist mutations, push registration, biometric lock) and 13 lib/util files, all untested, and no `test` script so it is invisible to `turbo test`. Several hooks carry non-trivial logic with unsafe casts — e.g. useMoveTask.ts:28-31 reaches into the SWR cache via `cache as unknown as { keys: () => IterableIterator<Arguments> }`.
- **Impact:** The client the maintainer cares most about has no regression safety net. Optimistic-update cache manipulation and the offline/biometric paths are exactly where silent breakage hurts users most.
- **Fix:** Add Vitest (or jest-expo) to native, start by unit-testing the cache-mutating board hooks (useMoveTask, useChecklistMutations, useBoardFilterPersistence) and the pure helpers, and add a `test` script so turbo/CI pick it up. The shared board logic is already tested in packages/shared — mirror that for the native-specific glue.

### 2.4MB seed.json of real referee PII is committed but unused; the seedTestDb loader was never shipped
- **Area:** style-testing · **Category:** security · **Effort:** small · **Confidence:** high
- **Where:** apps/api/src/test/fixtures/seed.json (2,496,274 bytes, git-tracked, contains real names e.g. "Arne Holländer" + license_number 40069 across 261 referees, 103 teams, 70 venues, 676 matches), docs/superpowers/specs/2026-03-18-pglite-test-infrastructure-design.md (Component 2 `seed-test-db.ts` / `seedTestDb`), no apps/api/src/test/seed-test-db.ts exists; grep for seed.json/seedTestDb in src returns nothing
- **Problem:** The PGlite design doc specified a `seed-test-db.ts` loader and a refreshable JSON fixture. The 2.4MB fixture was extracted and committed (real names, license numbers, hashes pulled from the live DB), but the `seedTestDb` loader was never written and nothing references seed.json. It is pure dead weight — and it is personal data of real referees living in source control forever.
- **Impact:** GDPR/privacy exposure: real federation-member PII is in git history with no consent basis and no purpose (no test uses it). It also bloats clones and contradicts the doc's own exclusion list rationale (which deliberately excluded auth/PII tables but the referees table still carries names).
- **Fix:** Delete seed.json from the repo (and scrub from history if feasible), or replace it with synthetic/anonymized data. Then either implement the `seedTestDb` loader the doc promised so a fixture has a purpose, or close out that part of the spec. Update the design doc status to reflect what actually shipped.

## Medium severity (47)

### Coverage thresholds enforced only in apps/api despite documented monorepo-wide policy
- **Area:** layout · **Category:** testing · **Effort:** medium · **Confidence:** high
- **Where:** apps/api/vitest.config.ts:19-23, packages/shared/vitest.config.ts, packages/api-client/vitest.config.ts, apps/web/vitest.config.ts, CLAUDE.md
- **Problem:** CLAUDE.md presents coverage thresholds (90% branches / 95% functions/lines/statements) as a project-wide testing requirement. In reality only apps/api/vitest.config.ts:19-23 sets thresholds. packages/shared, packages/api-client, and apps/web have vitest configs and tests but no coverage gate, and `pnpm coverage` (turbo coverage with dependsOn ^coverage) only has a `coverage` script in apps/api, so it is effectively an api-only command.
- **Impact:** Shared business logic (RBAC, board DnD, api-client) — the code most reused across both clients — can lose coverage without CI noticing. The documented guarantee does not match enforcement.
- **Fix:** Either add `coverage` scripts + thresholds to shared/api-client/web vitest configs and let turbo fan out, or correct CLAUDE.md to state coverage is enforced only for apps/api. Prefer the former for the shared packages, since regressions there hit both clients.

### "lint" is aliased to tsc --noEmit in 8 of 9 packages — only web actually lints
- **Area:** layout · **Category:** dx · **Effort:** medium · **Confidence:** high
- **Where:** apps/api/package.json:10, apps/native/package.json:11, packages/db/package.json:14, packages/shared/package.json:14, packages/ui/package.json:17, packages/sdk/package.json:13, packages/api-client/package.json:14, apps/web/package.json:9
- **Problem:** Across the workspace `"lint": "tsc --noEmit"` is identical to `"typecheck": "tsc --noEmit"`. Only apps/web runs a real linter (`eslint`). So `pnpm lint` typechecks twice for 8 packages and applies no style/correctness rules (no-floating-promises, no-explicit-any, import hygiene, exhaustive-deps) anywhere outside web — including the entire API (350 files) and native (110 files).
- **Impact:** Lint-class bugs (unhandled promises in workers, missing await, accidental any, React hooks deps in native) are completely uncaught outside web. Running tsc twice also wastes CI minutes. The naming is misleading: a green `pnpm lint` implies linting that is not happening.
- **Fix:** Add a shared flat ESLint config (typescript-eslint + import + the relevant react/react-native and node plugins) and wire a real `lint` script in api, native, shared, db, sdk, api-client, ui. Keep `typecheck` separate so they are not redundant.

### Design tokens hand-duplicated between packages/ui CSS and apps/native theme with no shared source
- **Area:** layout · **Category:** consistency · **Effort:** medium · **Confidence:** high
- **Where:** apps/native/src/theme/colors.ts:1-50, packages/ui/src/styles/globals.css, packages/ui/DESIGN-SYSTEM.md:1-10
- **Problem:** There is no shared design-token module. @dragons/ui is Radix/Tailwind and web-only (native imports it 0 times; native rolls its own components/ui). The color tokens are copy-pasted: apps/native/src/theme/colors.ts:3 literally says 'Ported 1:1 from packages/ui/src/styles/globals.css' and re-types every hex (#0e0e0e, #1b1b1b, #004b23 ...). DESIGN-SYSTEM.md scopes itself to 'the Dragons admin UI' and names globals.css as the source of truth, with no native story.
- **Impact:** Two sources of truth for one brand. A token change in globals.css silently diverges native until someone re-ports by hand. For a platform whose goal is a coherent web+native experience, the design system has no cross-client mechanism.
- **Fix:** Extract a framework-agnostic token module (plain TS objects, e.g. @dragons/shared/tokens or a @dragons/design-tokens package) consumed by both the Tailwind/CSS layer (generate globals.css from it) and apps/native/src/theme. Update DESIGN-SYSTEM.md to document the shared token source and the two consumers.

### CLAUDE.md, AGENTS.md, and README all describe an obsolete 6-package workspace
- **Area:** layout · **Category:** doc-drift · **Effort:** small · **Confidence:** high
- **Where:** CLAUDE.md, AGENTS.md:7-14, README.md:5-11
- **Problem:** The real workspace has 10 members (api, web, native, mobile, pi + db, shared, ui, sdk, api-client). CLAUDE.md's Monorepo Structure table lists only web/api/ui/sdk/db/shared (no api-client, native, mobile, pi). AGENTS.md 'Package Dependency Graph' (lines 7-14) lists the same 6 and omits api-client/native/mobile entirely. README.md:5-11 lists only web/api/ui. A grep of AGENTS.md for 'api-client'/'native'/'mobile' returns nothing in the graph.
- **Impact:** The documents AI agents and humans are told to treat as source of truth misrepresent the architecture: the two-client (web+native) shape, the shared api-client that ties them together, and the legacy/dead apps are all invisible. New contributors cannot learn the real boundaries from the docs.
- **Fix:** Update CLAUDE.md's structure table and AGENTS.md's dependency graph to include api-client (web+native consumer), native (Expo, the primary mobile client), and flag mobile (legacy/Capacitor) and pi (Python, no TS) as such. Rewrite README's workspace layout. Note web's dual api stack until consolidated.

### Legacy `notifications` table and `userNotificationPreferences.whatsapp*` columns are orphaned dead weight
- **Area:** db · **Category:** dead-code · **Effort:** small · **Confidence:** high
- **Where:** packages/db/src/schema/notifications.ts:12-31, packages/db/src/schema/notifications.ts:33-49, packages/db/src/schema/notification-log.ts:17
- **Problem:** The notification subsystem was rebuilt around `domain_events` -> `notification_log` (migration 0018), but the original `notifications` table (notifications.ts:12) still exists with no insert path anywhere in apps/api (grep for `insert(notifications)` returns nothing outside tests). Migration 0007 originally gave `user_notification_preferences` columns `notify_on_task_assigned`/`notify_on_booking_needs_action`/`notify_on_task_comment` which 0031 dropped, leaving `whatsappEnabled`/`whatsappNumber` (notifications.ts:38-39) as the only fields besides the new `locale`/`mutedEventTypes` — and the WhatsApp columns appear unused by the active push/in-app pipeline.
- **Impact:** Two notification models coexist in the schema, forcing every new contributor to figure out which is live. The dead `notifications` table invites accidental writes to the wrong table and bloats the documented data model. AGENTS.md still lists `notifications` as a current table (AGENTS.md:88) reinforcing the confusion.
- **Fix:** Drop the legacy `notifications` table in a migration, or document it explicitly as deprecated. Audit whether `whatsappEnabled`/`whatsappNumber` are still consumed; if WhatsApp is now a `channel_configs` row, remove the per-user columns.

### `scoreboard_snapshots` grows unbounded with no retention/pruning
- **Area:** db · **Category:** data-model · **Effort:** small · **Confidence:** high
- **Where:** packages/db/src/schema/scoreboard.ts:35-64, apps/api/src/services/scoreboard/ingest.ts:81
- **Problem:** `scoreboard_snapshots` is an append-only table that the Pi ingest writes a row to on every deduped state change (ingest.ts:81), but there is no pruning job anywhere (grep for delete/prune/retention against the table returns nothing). During a live game the Stramatel panel emits frequent frames, so this table accumulates indefinitely across every game forever.
- **Impact:** On a long-lived single-club deployment this is slow-motion table bloat: the `scoreboard_snapshots_device_captured_idx` index and the SSE replay queries degrade over a season, and backups grow without bound. It is the one clearly unbounded table in the schema.
- **Fix:** Add a retention worker (e.g. delete snapshots older than N days, or keep only the last match's worth per device) on the existing worker cron infrastructure, or convert to a TimescaleDB hypertable / partition by month. Document the retention policy alongside the table.

### Enums modeled as bare varchar/text with no DB-level CHECK, only TS `$type` casts
- **Area:** db · **Category:** data-model · **Effort:** medium · **Confidence:** high
- **Where:** packages/db/src/schema/referee-games.ts:36, packages/db/src/schema/matches.ts:49, packages/db/src/schema/venue-bookings.ts:30, packages/db/src/schema/domain-events.ts:18-26, packages/db/src/schema/notification-log.ts:32, packages/db/src/schema/tasks.ts:29
- **Problem:** Every closed-set value is stored as `varchar`/`text` with the allowed values enforced only by a TypeScript `.$type<...>()` annotation, which is compile-time only and erased at runtime. Examples: `referee_games.sr1_status/sr2_status` (varchar(20), values open/offered/filled — no constraint, referee-games.ts:36), `matches.period_format` (quarters/achtel, matches.ts:49), `venue_bookings.status` (venue-bookings.ts:30), `domain_events.source/urgency/entity_type` (plain text with only a code comment listing values, domain-events.ts:18-26), `notification_log.status` (text default 'pending', notification-log.ts:32), `tasks.priority`. No pgEnum and no CHECK constraint exists on any of them.
- **Impact:** Any code path or manual SQL that bypasses the TS layer (data migrations, admin scripts, the Pi sender, a future second client) can write a typo'd status and silently break filters like the `sr1_status = 'open'` referee query (referee-games.service.ts:129). For a platform meant to be extended by two clients, runtime-unenforced enums are a recurring source of silent data corruption.
- **Fix:** Promote the stable, high-traffic enums (booking status, referee slot status, match period_format, domain-event urgency/source) to `pgEnum` or add CHECK constraints. pgEnum keeps the Drizzle `$type` ergonomics while making the DB authoritative.

### `referee_games` is a near-total denormalized duplicate of `matches` + team/venue/league data
- **Area:** db · **Category:** data-model · **Effort:** large · **Confidence:** medium
- **Where:** packages/db/src/schema/referee-games.ts:15-59, packages/db/src/schema/matches.ts:17-102, apps/api/src/services/sync/referee-games.sync.ts
- **Problem:** `referee_games` duplicates kickoffDate/kickoffTime/matchNo/isCancelled/isForfeited from `matches`, plus denormalized snapshots of home/guest team names, league name+short, venue name+city, and home/guest club ids — even though it also carries `matchId`, `homeTeamId`, `guestTeamId`, and `leagueApiId` FKs/keys that could join to the canonical rows. It has its own `dataHash` and `last_synced_at` and is filled by a separate sync (referee-games.sync.ts) from a different federation account. So the same game can exist as both a `matches` row and a `referee_games` row with independently-syncing, potentially-diverging copies of date/time/cancellation state.
- **Impact:** Two sources of truth for 'when/where is this game and is it cancelled' invite drift: a schedule change synced into `matches` won't update the `referee_games` copy unless the second sync also runs, so the referee-facing native app (the app that matters) can show a stale kickoff while the admin sees the corrected one. The duplication also doubles the surface for the enum/timezone issues above.
- **Fix:** Treat `referee_games` as a true projection: keep only referee-specific columns (sr statuses, sr names/api-ids, ourClub flags, isHome/isGuest) plus the `matchId` FK, and read schedule/team/venue/cancellation fields by joining `matches` when `matchId` is set. Keep the denormalized name columns only as a fallback for games outside tracked leagues (where `matchId` is null), and document that split explicitly.

### Leaky services/admin boundary: public (and native-facing) routes import read logic from services/admin
- **Area:** api-arch · **Category:** architecture · **Effort:** medium · **Confidence:** high
- **Where:** apps/api/src/routes/public/match.routes.ts:5-6, apps/api/src/routes/public/standings.routes.ts:3, apps/api/src/services/admin/match-admin.service.ts (getOwnClubMatches), apps/api/src/services/admin/standings-admin.service.ts (getStandings), apps/api/src/services/public/home-dashboard.service.ts
- **Problem:** There is a deliberate services/public/ folder (home-dashboard, match-context, team-stats, calendar) — yet public routes for matches and standings reach into services/admin/match-admin.service and services/admin/standings-admin.service. So the 'admin' service folder is partly a misnomer: it holds shared read paths consumed by unauthenticated public endpoints and the native app. home.routes.ts does it right (services/public/), match/standings do not.
- **Impact:** The folder name implies an access-control / domain boundary that isn't real, which is risky: a future change to a 'admin' service (e.g. exposing internal fields, removing excludeInactive guards) can silently leak into public responses. It also blurs where shared club-read logic should live, making the services/admin folder a catch-all (24 files).
- **Fix:** Move genuinely-shared read functions (own-club match listing, standings, public match detail) into services/public/ or a neutral services/match/ + services/standings/ domain folder, and have admin routes import from there. Reserve services/admin/ for admin-only mutations. Document the boundary in AGENTS.md.

### Redundant per-request session fetch on every admin route (requireAuth + per-route guard each call getSession)
- **Area:** api-arch · **Category:** performance · **Effort:** medium · **Confidence:** high
- **Where:** apps/api/src/app.ts:48 (app.use("/admin/*", requireAuth)), apps/api/src/middleware/rbac.ts:8-15 (requireAuth), apps/api/src/middleware/rbac.ts:21-31 (requirePermission), apps/api/src/middleware/rbac.ts:63-68 (requireAnyRole), apps/api/src/middleware/rbac.ts:78-89 (requireRefereeSelf)
- **Problem:** app.use("/admin/*", requireAuth) calls auth.api.getSession and sets c.get('user'). Then the per-route guard (requirePermission/requireAnyRole) calls auth.api.getSession AGAIN from scratch, re-validating the session and re-setting user/session, before its permission check. Every admin request therefore performs at least two full session validations (each a DB/secret round-trip via better-auth).
- **Impact:** Doubles auth latency and DB load on the entire admin surface, which is the bulk of the API. As the club platform grows (more admins, native app polling), this is wasted work on the hot path. It also means the guards don't trust the upstream requireAuth contract, indicating unclear ownership of who establishes the session.
- **Fix:** Have requirePermission/requireAnyRole read the already-set c.get('user') from requireAuth and only call auth.api.userHasPermission / hasRole, rather than re-fetching the session. Keep the standalone getSession path only for routes mounted without the requireAuth prefix (e.g. device routes), or move requireAuth into rbac composition so each route fetches exactly once.

### Inconsistent error-response shapes and two competing validation-error strategies across routes
- **Area:** api-arch · **Category:** consistency · **Effort:** medium · **Confidence:** high
- **Where:** apps/api/src/routes/public/match.routes.ts:124 ({error:"Invalid ID"} no code), apps/api/src/routes/admin/social.routes.ts (multiple {error:"Not found"} no code), apps/api/src/middleware/error.ts:14-26 (ZodError → {error,code,details}), apps/api/src/routes/referee/games.routes.ts:49-54 (safeParse → {error,code,issues}), apps/api/src/routes/admin/broadcast.routes.ts:75-78 (safeParse → {error:'invalid body',code})
- **Problem:** Error envelopes are not uniform. Most routes return {error, code} (and the central errorHandler produces {error, code, details}), but public/match.routes.ts returns {error:'Invalid ID'} and several social/sync routes return bare {error:'...'} with no code. Validation is handled two ways: ~22 routes do schema.parse() and let errorHandler emit {error,code:'VALIDATION_ERROR',details}, while ~5 routes do safeParse() and hand-roll a 400 with a different field (issues vs details, or 'invalid body'). Referee assignment routes additionally map a service ERROR_STATUS_MAP and cast status as never (referee/assignment.routes.ts:82,117,143).
- **Impact:** Clients (web + native + api-client) must defensively handle multiple error shapes; a code-driven client cannot rely on `code` being present. The two validation paths produce different 400 bodies for what is conceptually the same failure, and the `as never` status casts defeat type-checking of HTTP status codes.
- **Fix:** Standardize on one error envelope {error, code, details?} and one validation strategy (preferably schema.parse + central ZodError handler, or zValidator everywhere). Add a shared typed error helper (e.g. jsonError(c, status, code, message)) and a typed status union to remove `as never`. Backfill `code` on the bare-{error} routes.

### AGENTS.md API Endpoints table has drifted from the actual routes (board columns, device path)
- **Area:** api-arch · **Category:** doc-drift · **Effort:** small · **Confidence:** high
- **Where:** AGENTS.md:335-337 (board column paths), apps/api/src/routes/admin/board.routes.ts:162-220 (actual paths), AGENTS.md:439 (/devices/register), AGENTS.md:643 (/api/devices/register), apps/api/src/routes/index.ts:61 (mounted at /api/devices)
- **Problem:** Documented board column routes are PATCH /admin/boards/columns/:id, PATCH /admin/boards/columns/:id/position, DELETE /admin/boards/columns/:id — but the real routes are nested: PATCH /admin/boards/:id/columns/reorder and PATCH|DELETE /admin/boards/:id/columns/:colId. The device endpoint is documented as POST /devices/register (line 439) yet mounted at /api/devices (index.ts:61) — and AGENTS.md is internally inconsistent, with line 643 correctly writing /api/devices/register. Broadcast endpoints (admin: /admin/broadcast/config|start|stop|matches, public: /public/broadcast/state|stream) are not documented at all.
- **Impact:** The endpoint table is the primary contract reference for web/native/api-client developers and AI agents. Wrong paths cause integration bugs and erode trust in the docs. The CLAUDE.md context already flags api-client/native/pi as undocumented; this confirms the API table itself is stale.
- **Fix:** Regenerate the AGENTS.md endpoint table from the actual route tree (or assert it in a test), fix the board-column and device paths, and add the broadcast section. Long-term, generating it from a real OpenAPI spec (see the OpenAPI finding) would prevent recurrence.

### Two parallel permission engines that disagree on whitespace in multi-role strings
- **Area:** rbac · **Category:** security · **Effort:** medium · **Confidence:** high
- **Where:** apps/api/src/middleware/rbac.ts:26-39 (requirePermission uses auth.api.userHasPermission), apps/api/src/middleware/rbac.ts:96-117 (requireRefereeSelfOrPermission uses shared can()), apps/api/src/middleware/rbac.ts:62-76 (requireAnyRole uses shared hasRole()), packages/shared/src/rbac.ts:72-97 (parseRoles trims, can() consumes it), node_modules/.../better-auth/dist/plugins/admin/has-permission.mjs:6 ((input.role||...).split(',') with NO trim)
- **Problem:** The API enforces permissions through two independent code paths. requirePermission/assertPermission delegate to better-auth's userHasPermission, whose hasPermission() splits the role string on ',' with no .trim() (has-permission.mjs:6). requireAnyRole/requireRefereeSelfOrPermission and ALL client-side gating use the hand-rolled can()/hasRole()/parseRoles(), where parseRoles() DOES .trim() each part (rbac.ts:74-76). For a stored role like 'admin, refereeAdmin' (a format AGENTS.md:533 calls valid and rbac.test.ts:25-31 explicitly tests as valid with spaces), can() recognizes 'refereeAdmin' but better-auth looks up acRoles[' refereeAdmin'] -> undefined -> denies. The same user is authorized by one guard and rejected by another for the same logical permission.
- **Impact:** Two source-of-truth permission systems that can silently diverge is the classic RBAC footgun: a route protected by requirePermission can reject a user that the UI (can()) showed as authorized, and vice-versa. Today the web user UI joins roles with ',' and no space (user-actions.tsx:123) and better-auth's own setRole joins without spaces, so it doesn't bite in the happy path — but any direct DB edit, seed, or migration that uses the documented spaced format flips behavior between guards. It is a latent correctness/security bug with no test asserting the two engines agree.
- **Fix:** Pick one engine. Either route every check through better-auth's userHasPermission (delete can()/canAll() from the enforcement path, keep them only for pure client-side hints), or route everything through the shared can() and stop calling userHasPermission. If both must coexist, normalize role storage to a canonical no-space form at the write boundary AND add a cross-engine agreement test that feeds the same (role, resource, action) matrix through both can() and userHasPermission and asserts identical results, including spaced inputs.

### Role checks have inconsistent session freshness; revoking a role does not take effect for up to 5 minutes on some guards
- **Area:** rbac · **Category:** security · **Effort:** medium · **Confidence:** high
- **Where:** apps/api/src/config/auth.ts:59-62 (cookieCache enabled, maxAge 5 min), apps/api/src/middleware/rbac.ts:62-71 (requireAnyRole reads session.user.role from getSession = cookie-cached), apps/api/src/middleware/rbac.ts:100-109 (requireRefereeSelfOrPermission reads can(session.user)), apps/api/src/middleware/rbac.ts:26-31 (requirePermission passes only userId -> better-auth findUserById = fresh DB read), node_modules/.../better-auth/dist/plugins/admin/routes.mjs:~823 (has-permission falls through to findUserById when no session header)
- **Problem:** requirePermission/assertPermission resolve the role via userHasPermission, which (given only userId, no forwarded session headers) falls through to internalAdapter.findUserById — a fresh DB read. But requireAnyRole and requireRefereeSelfOrPermission read role off auth.api.getSession, which honors the 5-minute cookieCache (auth.ts:59-62). better-auth's setRole updates the user row but does NOT deleteSessions (routes.mjs setRole only calls updateUser, unlike banUser which deletes sessions). So after an admin changes a user's role, requirePermission-guarded routes see the new role immediately while requireAnyRole-guarded routes (e.g. the Bull queue dashboard app.ts:53, openapi/docs app.ts:37-38, referee-link mutation user.routes.ts:16) keep honoring the OLD role for up to 5 minutes.
- **Impact:** Privilege de-escalation is not immediate on a subset of routes, and the inconsistency between guard types makes the security posture hard to reason about. A demoted user can still hit requireAnyRole('admin') routes (the queue dashboard, the user role-link admin endpoint) until the cookie cache expires.
- **Fix:** Make freshness uniform. Simplest: have requireAnyRole/requireRefereeSelfOrPermission resolve the role the same way as requirePermission (via userHasPermission / a fresh user lookup) instead of trusting cached session.user.role for authorization decisions. Alternatively, invalidate sessions on role change (wrap setRole or add a databaseHook on user.update that calls deleteSessions), and document that cookieCache trades 5 min of staleness for read throughput.

### isMember()/memberId is dead code referencing a non-existent table and column
- **Area:** rbac · **Category:** dead-code · **Effort:** small · **Confidence:** high
- **Where:** packages/shared/src/rbac.ts:126-130 (isMember), packages/shared/src/rbac.test.ts:203-213 (tests for it), packages/shared/src/index.ts:213 (exported), packages/db/src/schema/auth.ts:4-17 (user table has refereeId but NO memberId)
- **Problem:** isMember<U extends { memberId?: number|null }>() and the concept of memberId are exported, documented by type, and unit-tested, but there is no memberId column anywhere (grep of packages/db/src finds zero memberId/member_id), no members table in the schema dir, no additionalFields.memberId in auth.ts (only refereeId at auth.ts:93-99), and no app code calls isMember (only rbac.ts defines it and index.ts re-exports it). The GateUser type (rbac.ts:67-70) doesn't even include memberId, so isMember could never be called on a GateUser. It is a fully orphaned API with passing tests that give false confidence that 'member' identity exists.
- **Impact:** Misleads contributors into thinking a club-member identity link is wired up when it isn't — directly relevant to the platform goal of covering the whole club lifecycle (members are a core domain concept). Dead exports with tests are worse than no code: they pad coverage and imply a feature that doesn't exist.
- **Fix:** Either delete isMember + its tests + the export until a members table and user.memberId column actually exist, or (if member identity is on the roadmap) land the schema (members table, user.memberId FK, auth.ts additionalFields.memberId, GateUser including memberId) in the same change so the helper is real. Don't keep a tested helper for a column that doesn't exist.

### Roles stored as a comma-separated string in a free-text column with no integrity or validation
- **Area:** rbac · **Category:** data-model · **Effort:** medium · **Confidence:** medium
- **Where:** packages/db/src/schema/auth.ts:10 (role: text('role'), nullable, no check constraint), packages/shared/src/rbac.ts:72-80 (parseRoles re-parses on every check), AGENTS.md:533 (documents comma-separated string as the storage format)
- **Problem:** user.role is a nullable text column holding 0..N roles joined by ','. There is no check constraint, no enum, no FK to a roles table — nothing prevents 'addmin' or 'admin,,garbage,' from being written by a raw SQL edit or a buggy seed. parseRoles() defensively filters unknown names on every read (rbac.ts:78-79), which means a typo'd role is silently dropped rather than erroring — a misconfigured admin just silently has no powers. Every authorization decision re-splits and re-validates the string (can() calls parseRoles() each invocation, rbac.ts:88). This is the better-auth admin plugin's native format, so it's a constrained tradeoff, but the consequences (no referential integrity, stringly-typed multi-value in one column, parse-on-every-check) are real.
- **Impact:** Stringly-typed multi-valued data in a single column is a normalization smell that bites maintainability: you can't query 'all users with venueManager' with an index, can't FK-protect role names, and silent-drop-on-typo turns a misconfiguration into a hard-to-debug 'why can't this admin do anything' ticket. For a platform meant to grow more roles, this scales poorly.
- **Fix:** Accept that the column format is dictated by better-auth, but harden the edges: (1) add a CHECK constraint or a DB trigger validating each comma part against the known role set, or at minimum a startup assertion/migration audit; (2) make parseRoles() (or a strict variant used at the write boundary) throw on unknown names instead of silently filtering, so a bad setRole fails loudly; (3) document that querying-by-role is intentionally not supported, or introduce a normalized user_roles join table as the source of truth and project it into the better-auth string for the plugin's consumption.

### user.refereeId has no uniqueness constraint — two auth users can claim the same referee identity
- **Area:** rbac · **Category:** data-model · **Effort:** small · **Confidence:** high
- **Where:** packages/db/src/schema/auth.ts:14 (refereeId: integer().references(() => referees.id) — FK only, not unique), apps/api/src/routes/admin/user.routes.ts:38-42 (referee-link update sets refereeId with no duplicate check), apps/api/src/middleware/rbac.ts:78-91 (requireRefereeSelf scopes all self-service to this id)
- **Problem:** refereeId is a plain nullable FK with no unique constraint. The referee-link admin endpoint (user.routes.ts:14-50) validates that the referee exists but does not check whether another user is already linked to it. Two distinct auth users can therefore both be linked to referee #42, and both pass requireRefereeSelf and operate on referee #42's assignments/claims as 'self'. The identity link that the entire referee self-service authorization model rests on is not enforced to be 1:1.
- **Impact:** The self-service scoping (the soundest part of the RBAC design) silently assumes each referee maps to at most one user. Without a unique index, a mis-link or malicious admin action lets two accounts act as one referee — claiming/releasing each other's game slots — with no audit distinction. Data-integrity bug at the heart of the referee feature, which is a named pillar of the platform (SR management).
- **Fix:** Add a unique constraint on user.refereeId (partial unique allowing multiple NULLs: CREATE UNIQUE INDEX ... ON "user" (referee_id) WHERE referee_id IS NOT NULL) and have the referee-link endpoint return a 409 when the target referee is already linked to another user. Add a test covering the duplicate-link rejection.

### Adding a role/resource requires synchronized edits across at least 5 files with no compile-time linkage
- **Area:** rbac · **Category:** dx · **Effort:** medium · **Confidence:** medium
- **Where:** packages/shared/src/rbac.ts:4-17,25-63 (statement + roles + ROLE_NAMES), packages/shared/src/nav-surfaces.ts:24-42 (SURFACES catalog), apps/web/src/components/admin/app-sidebar.tsx:78 (SURFACE_META by id), apps/native/src/lib/tools/surfaces.ts:12-27 (NATIVE_SURFACES by id), AGENTS.md:535-542 (the documented 6-step checklist)
- **Problem:** AGENTS.md:535-542 lays out a 6-step manual checklist to add a role/resource. The surface catalog (nav-surfaces.ts) is keyed by string id, and BOTH the web SURFACE_META (app-sidebar.tsx:78) and native NATIVE_SURFACES (surfaces.ts:12) are separate Record<string,...> maps keyed by the same ids with no type relationship to the SURFACES array. A new surface added to nav-surfaces.ts compiles fine even if the web/native presentation maps are never updated — it just silently fails to render on a client. ROLE_NAMES (rbac.ts:62) is a hand-maintained tuple that must be kept in sync with the roles object (rbac.ts:60); there's a test asserting the exact contents (rbac.test.ts:215-225) but nothing derives one from the other.
- **Impact:** Extensibility is a stated goal (more roles/surfaces as the club platform grows). The current shape makes every addition a multi-file, string-keyed, drift-prone chore where omissions fail silently per client rather than at compile time. The permission-coverage test (permission-coverage.test.ts) guards API routes but nothing guards surface->presentation completeness.
- **Fix:** Derive ROLE_NAMES from Object.keys(roles) (or assert via a type-level check) so they can't drift. Type the web/native presentation maps as Record<SurfaceId, Meta> where SurfaceId = (typeof SURFACES)[number]['id'] so a missing presentation entry is a compile error. Consider folding the per-client presentation (label/route/icon) into the shared Surface definition with client-specific sub-objects, so a surface is added in exactly one place.

### @dragons/shared is a junk-drawer mixing JSX components, zod schemas, RBAC, and DnD logic in one package
- **Area:** shared · **Category:** architecture · **Effort:** large · **Confidence:** high
- **Where:** packages/shared/package.json:18-29, packages/shared/src/social-templates/shared.tsx:1-66, packages/shared/src/rbac.ts:1-2, packages/shared/src/domain-event-schemas.ts:1, packages/shared/src/board-dnd.ts:1-118, packages/shared/src/index.ts:1-243
- **Problem:** One package bundles: (1) React/JSX social-template components (.tsx) needing a react peerDependency and @types/react, (2) pure zod runtime schemas (validation.ts, domain-event-schemas.ts) pulling zod, (3) a better-auth dependency for RBAC (rbac.ts imports better-auth/plugins/access), (4) pure DnD/board algorithms, and (5) nav config and ~40 plain DTO type modules. Every consumer — including the API, which only wants zod schemas and types — transitively gains react, @types/react, and better-auth as deps. The 243-line index.ts barrel re-exports all of it.
- **Impact:** The package has no coherent responsibility, so its dependency surface and bundle weight are dictated by its heaviest member (JSX + better-auth). It's hard to reason about what's safe to import where, and the barrel forces every change through one growing file. This directly hurts maintainability/extensibility of the platform's foundational package.
- **Fix:** Split along consumption boundaries: shared-types (pure DTOs + constants, zero runtime deps), shared-domain (zod schemas, rbac, board/nav/today pure logic), and shared-ui (the social-template .tsx, react peerDep). The API and api-client then depend only on the lighter packages. At minimum, move social-templates into @dragons/ui or its own package so the react peerDependency leaves @dragons/shared.

### Raw federation SDK shapes leak through @dragons/shared into both client UIs
- **Area:** shared · **Category:** architecture · **Effort:** medium · **Confidence:** high
- **Where:** packages/shared/src/referee-assignment.ts:1, packages/shared/src/referee-assignment.ts:21-24, packages/sdk/src/types/referee-assignment.ts
- **Problem:** CandidateSearchResponse.results is typed as SdkRefCandidate[] — the raw German-federation SDK candidate shape imported straight from @dragons/sdk into a client-facing response type. shared is the only non-API package that depends on @dragons/sdk, and it does so to pass a federation DTO through to web+native referee-assignment UIs verbatim.
- **Impact:** The federation's wire shape (foreign field names, optionality, churn) becomes part of the client contract. When check-types detects the federation changed SdkRefCandidate, the break propagates into both mobile and web UI code instead of being absorbed at the API boundary. It also forces @dragons/shared to depend on the SDK.
- **Fix:** Map SdkRefCandidate to a client-owned RefereeCandidate DTO in the API and have CandidateSearchResponse reference that, removing the @dragons/sdk dependency from @dragons/shared entirely.

### Native Tools screen and web sidebar maintain parallel id-to-presentation maps that can silently drop surfaces on rename
- **Area:** shared · **Category:** consistency · **Effort:** medium · **Confidence:** medium
- **Where:** packages/shared/src/nav-surfaces.ts:24-42, apps/web/src/components/admin/app-sidebar.tsx:78-94, apps/web/src/components/admin/app-sidebar.tsx:125-131, apps/native/src/lib/tools/surfaces.ts:12-39, apps/native/src/app/(tabs)/tools.tsx:29-31
- **Problem:** The shared SURFACES catalog lists 17 surface ids, but each client re-declares an id-keyed presentation map (SURFACE_META in web, NATIVE_SURFACES in native). Native only ports 2 of 17 (officiating, boards) and re-states id+group redundantly. Both clients silently filter out any surface whose id is missing from their local map (app-sidebar.tsx:128 `if (!meta) return []`; tools.tsx:30 `.filter(Boolean)`). If a surface id in shared is renamed, both clients just stop rendering it with no error.
- **Impact:** The shared catalog is the contract but it isn't enforced — renames or new surfaces drift out of the clients invisibly, undermining the role-aware-shell foundation the recent commits were building (50c5498, c82f383). Native's coverage gap (2/17) means the shared catalog overstates what mobile actually offers.
- **Fix:** Make the presentation maps exhaustive over the surface-id union (Record<SurfaceId, Meta>) so adding/renaming a surface forces a compile error in both clients, or co-locate platform routes/labels in the shared Surface entry with per-platform optional fields. Track native porting coverage explicitly.

### SDK type-guard coverage is 3 of 40 types, and the safe guards aren't enforced at sync boundaries
- **Area:** shared · **Category:** code-style · **Effort:** medium · **Confidence:** medium
- **Where:** packages/sdk/src/helpers/type-guards.ts:5-33, packages/sdk/src/index.ts:48, apps/api/src/services/sync/sdk-client.ts:1
- **Problem:** Only isSdkLiga, isSdkSpielplanMatch, isSdkTabelleEntry exist for 40 exported Sdk* types. The federation responses (parsed JSON, inherently unknown at runtime) are cast to Sdk* types in sdk-client.ts rather than narrowed via guards. The high-churn referee/game-details types (SdkGetGameResponse, SdkRefCandidate, SdkSubmitResponse) have no guards despite being the most fragile federation surface.
- **Impact:** isSdk* discipline is documented as a convention (CLAUDE.md, AGENTS.md) but is mostly aspirational — malformed federation payloads pass through as trusted typed objects, so sync failures surface as confusing downstream errors instead of a clear 'shape mismatch at ingest'.
- **Fix:** Either add guards for the response-root types actually validated at the sync boundary and call them in data-fetcher/sdk-client, or lean on the existing zod approach and validate federation responses with zod schemas at ingest. Don't keep three orphan guards that imply coverage that isn't there.

### AGENTS.md SDK Types section is stale: wrong type names, missing files, and a foreign absolute path
- **Area:** shared · **Category:** doc-drift · **Effort:** small · **Confidence:** high
- **Where:** AGENTS.md:612-625, packages/sdk/src/types/club.ts, packages/sdk/src/types/referee-assignment.ts, packages/sdk/src/index.ts:1-49
- **Problem:** The SDK Types table (AGENTS.md:612-625) lists SdkOpenGame / SdkOpenGamesResponse for game-details.ts, but the actual exports are SdkOffeneSpieleLiga/SdkOffeneSpieleSp/SdkOffeneSpielResult/SdkOffeneSpieleResponse (index.ts:26-31). The table omits the entire referee-assignment.ts type file (8 types incl. SdkRefCandidate). The sample-responses path points at /Users/jn/git/dragons-mono/apps/api/sdk-type-samples/ — a different developer's machine and a directory that no longer exists; samples actually live in packages/sdk/src/samples/. Separately, CLAUDE.md documents only 6 packages and omits api-client/native entirely.
- **Impact:** An agent or new contributor reading the intended-architecture doc gets type names that don't compile, a dead file path, and no awareness that api-client even exists — the doc actively misleads on the SDK boundary it's supposed to describe.
- **Fix:** Regenerate the SDK Types table from packages/sdk/src/index.ts, add the referee-assignment.ts row, fix the samples path to packages/sdk/src/samples/, and add api-client/native to the package list in CLAUDE.md/AGENTS.md.

### Native app has zero tests and no test runner, contradicting the design spec and repo coverage policy
- **Area:** native · **Category:** testing · **Effort:** large · **Confidence:** high
- **Where:** apps/native/package.json:scripts (no test/coverage script; "lint" is aliased to "tsc --noEmit"), docs/superpowers/specs/2026-05-20-native-role-aware-shell-design.md:141 ("component tests for shell and Today states"), docs/superpowers/specs/2026-05-20-native-role-aware-shell-design.md:172 ("Native components: (tabs)/_layout.tsx renders the expected triggers per role; Today aggregates..."), docs/superpowers/plans/2026-05-20-native-role-aware-shell.md:7 ("Native UI is thin and verified by tsc + manual run (native has no unit-test harness)")
- **Problem:** apps/native ships ~15.6k lines (110 files) with no Vitest/Jest harness and no test files. `lint` is just `tsc --noEmit`, so there is also no ESLint. The design doc explicitly promised component tests for the shell and Today states; the plan then quietly downgraded this to "tsc + manual run". Non-trivial native-only logic is untested: the referee Today provider's slot-partition predicate (referee.ts:23-33), useBoardDrag (404 lines), the biometric gate state machine, and the 401 de-dup flow.
- **Impact:** CLAUDE.md mandates 90% branch / 95% line coverage and "every new feature MUST have tests"; the mobile app that "matters most" is the single largest untested surface in the monorepo. Regressions in role gating, referee slot logic, or drag-reorder ship silently. The thin-UI argument holds for trivial screens but not for the 400-line drag hook or the provider predicates.
- **Fix:** Add a Vitest + @testing-library/react-native (or jest-expo) harness to apps/native and wire `test`/`coverage` scripts. Prioritize tests for the non-pure native logic that shared cannot cover: today providers' item derivation (mock SWR), useBoardDrag/useColumnDrag drop math, useBiometricLock state transitions, and the api.ts 401 de-dup. Restore a real ESLint config so `lint` is not a tsc alias.

### "Today" boundary is computed with three different, timezone-unsafe strategies; web has a club-timezone helper native ignores
- **Area:** native · **Category:** consistency · **Effort:** medium · **Confidence:** high
- **Where:** apps/web/src/lib/tz.ts:1 (ADMIN_TZ="Europe/Berlin"; todayInBerlin() uses Intl with timeZone), apps/native/src/lib/today/providers/referee.ts:6-9 (todayIso() uses device-local new Date() getFullYear/Month/Date), apps/native/src/app/(tabs)/schedule.tsx:30 (today via new Date().toISOString().split("T")[0] — UTC), apps/native/src/app/(tabs)/schedule.tsx:35 (parses "dateStr + T00:00:00" as device-local)
- **Problem:** The club is German (fixed Europe/Berlin). Web correctly anchors "today" to ADMIN_TZ via Intl.DateTimeFormat. Native uses device-local time in the referee Today provider, UTC (toISOString) in schedule's today(), and device-local parsing for section grouping — three inconsistent definitions of "today", none of which is the club timezone. A referee near a midnight boundary, or travelling, sees open-slot/next-game cutoffs computed against the wrong day; UTC vs local can flip which games count as "today".
- **Impact:** Referees are the priority audience; the Today feed's open-slots count and next-assignment selection silently depend on which timezone definition fires. The drift between schedule (UTC) and the Today provider (local) means the same game can appear "today" on one screen and not the other.
- **Fix:** Add a shared today-in-club-tz helper to packages/shared (move/generalize the Europe/Berlin logic out of apps/web/src/lib/tz.ts so both clients import it) and use it in referee.ts, club.ts, and schedule.tsx. Remove the duplicated todayIso()/today() locals.

### Today screen shows "all caught up" empty state while provider data is still loading
- **Area:** native · **Category:** dx · **Effort:** small · **Confidence:** high
- **Where:** apps/native/src/app/(tabs)/today.tsx:19 (items.length===0 -> empty state, no loading branch), apps/native/src/lib/today/registry.ts:13-21 (useTodayItems returns [] until SWR resolves), apps/native/src/lib/today/providers/referee.ts:18 (if (!data) return []), apps/native/src/lib/today/providers/club.ts:13 (if (!data?.nextGame) return [])
- **Problem:** useTodayItems aggregates providers that each return [] until their SWR fetch resolves. The Today screen treats items.length===0 as the "You're all caught up" empty state with no loading/error branch. On first paint of the signed-in landing screen, a referee with pending assignments sees "all caught up" for the duration of the fetch, then the list pops in.
- **Impact:** This is the post-sign-in landing screen for staff. Showing a false "nothing to do" state on the screen meant to drive action undercuts the entire Today feature, and there is no error state if a provider fails (the SWR error is swallowed by registry aggregation).
- **Fix:** Have providers expose isLoading/error (or have useTodayItems return {items,isLoading,error}) and render a skeleton on first load and an error affordance on failure, distinct from the genuine empty state. A BoardListSkeleton-style component already exists to model this.

### Native design tokens are a hand-maintained 1:1 copy of the web globals.css, with no shared source of truth
- **Area:** native · **Category:** consistency · **Effort:** medium · **Confidence:** high
- **Where:** apps/native/src/theme/colors.ts:2 ("Ported 1:1 from packages/ui/src/styles/globals.css"), apps/native/src/theme/colors.ts:9-119 (~60 color tokens duplicated by hand), packages/ui/src/styles/globals.css:16-133 (the web source these mirror), packages/shared/src/brand.ts (only shared brand asset is clubLogoUrl — no color tokens)
- **Problem:** The native color palette (light + dark, ~60 tokens each) is a manual transcription of the web CSS variables. They currently match exactly, but there is no single source: a brand tweak in globals.css will not propagate to native, and vice-versa, with no test catching the drift. packages/shared/src/brand.ts only shares the club-logo URL, not the palette. Native additionally lacks `warning`/`success` tokens that board code expects (see separate finding).
- **Impact:** "Consistency with web branding" is a stated goal; two hand-kept copies of the design system guarantee eventual drift between the web admin and the mobile app the club cares most about. This is the classic duplicated-constant problem across package boundaries.
- **Fix:** Promote the raw token hex values to a single TS module in packages/shared (or a tokens package) consumed by both: native imports them directly, and web generates its CSS variables from the same source (or a build-time check asserts globals.css matches). At minimum add a test that diffs the two token sets.

### Translations are fully duplicated across native (i18n-js) and web (next-intl) with no shared message source
- **Area:** native · **Category:** consistency · **Effort:** medium · **Confidence:** medium
- **Where:** apps/native/src/lib/i18n.ts:1 (i18n-js with de.json/en.json), apps/native/src/i18n/de.json (314 keys; namespaces: standings, teams, board, common, schedule, ...), apps/web/src/messages/de.json (1397 lines; namespaces: standings, teams, board, common, ...), packages/shared/src (no shared messages module)
- **Problem:** Web uses next-intl with src/messages/*, native uses i18n-js with src/i18n/*. The namespaces overlap heavily in domain vocabulary (standings, teams, board, common, errors) but the files are entirely separate, with different key shapes (web nav.* vs native tabs.*). German basketball terminology (SR/Schiedsrichter, Liga) must be translated and kept consistent in two places by hand. (Native de/en are at least in perfect key parity, suggesting a parity check exists for native internally.)
- **Impact:** Drift risk on user-facing copy across the two clients the club uses side by side; a wording or terminology fix on web (e.g. how a referee slot status is phrased) silently does not reach mobile. The duplication grows with every ported screen.
- **Fix:** At minimum, extract the shared domain vocabulary (status labels, role names, common actions) into a framework-neutral messages module in packages/shared that both next-intl and i18n-js load, leaving only client-specific screen copy local. Add a CI check that overlapping namespaces stay in sync.

### Match change events are published outside the row's transaction, so a crash after commit loses them with no outbox recovery
- **Area:** sync-events · **Category:** architecture · **Effort:** medium · **Confidence:** high
- **Where:** apps/api/src/services/sync/matches.sync.ts:534-599, apps/api/src/services/sync/matches.sync.ts:677-700, apps/api/src/services/events/event-publisher.ts:139-146
- **Problem:** Inside the per-match transaction, override.conflict IS published with the tx (matches.sync.ts:495-514) — correct outbox usage. But the main match.* events (schedule/venue/result/confirmed) are published AFTER the transaction returns, with no tx argument (matches.sync.ts:586-595), as is match.created (matches.sync.ts:677). Per event-publisher.ts:139-146, no-tx publish does insert + immediate fire-and-forget enqueue. So the DB write to `matches` commits in one transaction and the corresponding domain_events row is inserted in a separate autocommit afterward. If the process dies between commit and the event insert, the match update is persisted but the notification is permanently lost — the outbox can't recover an event row that was never written. This defeats the very atomicity the outbox pattern was built to provide and is inconsistent with the in-tx override.conflict in the same function.
- **Impact:** Silent missed notifications for exactly the high-value, time-sensitive changes (a venue change or cancellation the day before a game) that members rely on. The inconsistency (some events in-tx, some not, in one function) also makes the correct pattern non-obvious to the next contributor.
- **Fix:** Move match.* and match.created publishes inside the same transaction that updates/inserts the match row (pass tx, let the poller enqueue). The classifyMatchChanges output and payloads are already computed from data available inside the tx, so this is a reordering rather than a redesign.

### Domain event schema has no version field; payload evolution relies on permissive Zod that logs-and-publishes-anyway
- **Area:** sync-events · **Category:** data-model · **Effort:** medium · **Confidence:** medium
- **Where:** packages/db/src/schema/domain-events.ts:14-43, apps/api/src/services/events/event-publisher.ts:43-50, packages/shared/src/domain-event-schemas.ts:50-58, packages/shared/src/domain-event-schemas.ts:302-314
- **Problem:** domain_events stores type + free-form jsonb payload with no schemaVersion column. validateEventPayload runs at publish time but on failure only logs a warning and publishes the malformed event anyway (event-publisher.ts:45-50), and several schemas use .passthrough() / .nullish() (domain-event-schemas.ts:50-58, 180-209) so drift is tolerated rather than caught. Events are retained up to a year (cleanupOldDomainEvents default 365, workers/index.ts:132) and re-read at processing time by the event.worker (event.worker.ts:31-35) and digest.worker (digest.worker.ts:40-53). If a payload shape changes, old persisted rows and new consumer code can disagree with nothing to discriminate them.
- **Impact:** As the platform grows new event types and the native app starts consuming richer payloads, payload evolution becomes a guessing game. A log-and-publish-anyway validator means a producer bug ships invalid notifications to members rather than failing fast in CI/dev.
- **Fix:** Add a schemaVersion integer to domain_events and stamp it on insert; branch consumers on it. In non-production, make validateEventPayload throw (or gate behind an env flag) so schema drift fails tests instead of reaching users. Tighten the .passthrough() schemas once the override payload field names are settled.

### Outbox poller builds a raw SQL IN-list by string concatenation instead of parameterized query
- **Area:** sync-events · **Category:** code-style · **Effort:** small · **Confidence:** high
- **Where:** apps/api/src/services/events/outbox-poller.ts:42-49
- **Problem:** releaseClaim builds `WHERE id IN (...)` via sql.raw with manual single-quote escaping: `ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(",")`. The ids are ULIDs generated internally so this isn't currently exploitable, but it hand-rolls SQL escaping in a codebase that otherwise uses Drizzle's parameterized `inArray`/`sql` bindings everywhere (e.g. workers/index.ts:124-125 uses inArray). It's a latent injection footgun and an inconsistency with the project's stated 'Zod/typed boundaries, no unsafe casts' conventions.
- **Impact:** Low immediate risk but it's a pattern that invites copy-paste into a path that does take external input, and it reads as a code smell in an otherwise carefully-typed module.
- **Fix:** Replace with Drizzle's `inArray(domainEvents.id, ids)` in a normal `db.update(...).set({ enqueuedAt: null }).where(inArray(...))`, matching the rest of the codebase. No manual escaping needed.

### Notification side effects are emitted inline from sync services, coupling the sync layer to the notification subsystem
- **Area:** sync-events · **Category:** architecture · **Effort:** large · **Confidence:** medium
- **Where:** apps/api/src/services/sync/matches.sync.ts:546-599, apps/api/src/services/sync/referees.sync.ts:329-415, apps/api/src/services/sync/index.ts:273-308, apps/api/src/services/sync/referee-games.sync.ts:288-417
- **Problem:** Although the system has a clean event bus, the sync services themselves contain large blocks of event-payload construction (e.g. the ~50-line per-event-type payload switch at matches.sync.ts:546-599) interleaved with their core upsert logic. Each emitter wraps publishDomainEvent in its own try/catch that swallows failures with a log.warn (matches.sync.ts:596-598, referees.sync.ts:351-353, index.ts:306-308). So 'did sync work' and 'did notifications get queued' are entangled in one function, and a swallowed publish failure isn't reflected in the sync run's error count or status.
- **Impact:** The sync layer can't be reasoned about or tested without the events layer; the inline payload-building is duplicated shape-by-shape across matches/referees/referee-games; and swallowed publish errors mean a sync can report 'completed' while having dropped notifications. This works against the goal of an extensible platform where sync and notifications evolve independently.
- **Fix:** Have sync services return a typed list of 'changes' (e.g. {kind, matchId, before, after}) and move payload construction + publishDomainEvent into a dedicated event-emitter step that runs over those changes inside the same transaction. This isolates sync from notification concerns and lets publish failures surface into the sync run summary.

### No dead-letter handling; failed events/jobs are silently dropped after retention count
- **Area:** sync-events · **Category:** architecture · **Effort:** medium · **Confidence:** medium
- **Where:** apps/api/src/workers/queues.ts:8-66, apps/api/src/workers/event.worker.ts:24-67, apps/api/src/workers/index.ts:24-108
- **Problem:** domain-events, referee-reminders, and push-receipt queues all use attempts:1 with removeOnFail counts (queues.ts:11-61), and there is no dead-letter queue, no failed-job alarm, and no admin surface for stuck events. The event.worker swallows 'event not found' as a normal skip (event.worker.ts:37-39). The outbox poller releases claims on enqueue failure (good) but there's no escalation if an event repeatedly fails to enqueue — it just gets re-claimed every 30s forever with only a log line. Nothing marks a domain_events row as 'permanently failed'.
- **Impact:** When Basketball-Bund drift produces a malformed payload, or Redis hiccups, a notification can fail with no operator visibility and no recovery path beyond reading logs. For a small club ops team this means missed referee alerts go undetected until someone complains.
- **Fix:** Add a failed/attempts counter (or processedAt/failedAt columns) to domain_events so the poller can give up after N attempts and surface them in the admin sync/events UI; add a dead-letter queue or at minimum a failed-job count metric/alert for the event and reminder queues.

### Hash skip can mask real changes when game details intermittently fail to fetch
- **Area:** sync-events · **Category:** data-model · **Effort:** medium · **Confidence:** medium
- **Where:** apps/api/src/services/sync/matches.sync.ts:321-348, apps/api/src/services/sync/data-fetcher.ts:67-79, apps/api/src/services/sync/sdk-client.ts:408-459
- **Problem:** getGameDetailsBatch uses Promise.allSettled and silently omits matches whose detail fetch failed (sdk-client.ts:418-444). For those matches, `details` is null, so toRemoteSnapshot derives scores/period/SR-open fields as null/false (matches.sync.ts:121-123), the hash is computed over that degraded snapshot, and if it differs from the stored hash the code enters the update path that specifically preserves prior detail-sourced fields (matches.sync.ts:422-461). The inverse risk: if the spielplan-level fields are unchanged and details were present last run but fail this run, the degraded hash differs and triggers an update+version row that carries a snapshot with nulled SR/period data, even though the preservation logic restores the columns — i.e. matchRemoteVersions accumulates snapshots that don't reflect true remote state. Conversely a genuine change only visible in details (e.g. SR slot opened) is invisible whenever that match's detail fetch fails, with no flag distinguishing 'detail unavailable' from 'no change'.
- **Impact:** Version history (matchRemoteVersions snapshots) can be polluted with detail-fetch-failure artifacts, and detail-only changes (open referee slots — core to the SR workflow) can be silently missed on flaky federation API days. Failures are only logged, never recorded against the sync run.
- **Fix:** Track per-match detail-fetch success and either skip hash/version writes when details are unavailable (treat as 'no usable detail data this run') or store a degraded flag on the version snapshot. Surface detail-fetch failure counts into the sync run summary so flaky days are visible.

### match.rescheduled push template + role-default is dead code; real event is match.schedule.changed
- **Area:** notifications · **Category:** dead-code · **Effort:** small · **Confidence:** high
- **Where:** apps/api/src/services/notifications/templates/push/match-rescheduled.ts:36, apps/api/src/services/notifications/templates/push/index.ts:45, apps/api/src/services/notifications/role-defaults.ts:42, packages/shared/src/domain-events.ts:12
- **Problem:** PUSH_ELIGIBLE_EVENTS and renderPushTemplate both key on 'match.rescheduled', but no code ever emits that type — the schedule-change event is EVENT_TYPES.MATCH_SCHEDULE_CHANGED ('match.schedule.changed'). grep confirms match.rescheduled appears only inside the notification module, never at an emit site. So schedule changes get zero push, and an entire template file + payload type is unreachable.
- **Impact:** Users never get pushed about rescheduled games (a high-urgency event), while maintainers see a template that looks wired up. Silent feature gap.
- **Fix:** Either rename the template/case to 'match.schedule.changed' and map its payload (changes[] array) into the push shape, or delete match-rescheduled.ts. Add an assertion test that every key in PUSH_ELIGIBLE_EVENTS resolves to a non-null renderPushTemplate for a real emitted payload.

### In-app inbox filters recipientId === userId, but the pipeline writes prefixed/group IDs
- **Area:** notifications · **Category:** consistency · **Effort:** medium · **Confidence:** high
- **Where:** apps/api/src/services/admin/notification-admin.service.ts:48, apps/api/src/services/admin/notification-admin.service.ts:135, apps/api/src/services/notifications/notification-pipeline.ts:223-227, apps/api/src/services/notifications/role-defaults.ts:115
- **Problem:** listNotifications/getUnreadCount filter notification_log.recipientId == raw userId (e.g. 'u_abc'). But the pipeline stores in-app rows with recipientId = 'audience:admin' for admin events, 'referee:42' for referee events, and 'user:u_abc' (prefixed) for task events. Only the push channel writes the bare userId. So an in-app inbox query by raw userId returns zero of the in_app rows actually meant for that user.
- **Impact:** The per-user in-app notification inbox is effectively empty for normal recipients — task assignees, referees, and admins never see their in_app notifications through this query. Core feature silently broken.
- **Fix:** Pick one recipient identity convention and apply it end to end. Either expand the inbox query to match ['user:'+id, 'referee:'+refId, 'audience:'+role] for the caller, or normalize stored recipientIds to bare user IDs (fanning out audience:* to per-user rows). Add an integration test: emit task.assigned, then assert listNotifications({userId}) returns it.

### In-memory coalescing map is per-process and keyed too coarsely
- **Area:** notifications · **Category:** architecture · **Effort:** medium · **Confidence:** medium
- **Where:** apps/api/src/services/notifications/notification-pipeline.ts:30-65, apps/api/src/services/notifications/notification-pipeline.ts:388
- **Problem:** shouldCoalesce uses a module-level Map keyed only by entityType:entityId with a 60s window, ignoring event type and recipient. Two distinct events on the same match (e.g. match.cancelled then referee.assigned, or two different referees assigned) within 60s suppress each other's immediate dispatch. The map is also process-local: with the documented multi-instance Cloud Run deploy (and even across the worker/api split), each instance has its own map, so coalescing is non-deterministic and untestable in production.
- **Impact:** Legitimate distinct notifications can be silently dropped from immediate delivery (they still buffer for digest, but urgent ones lose immediacy). Behavior differs single-instance vs prod, making bugs hard to reproduce.
- **Fix:** If coalescing is needed, key it by (entityType, entityId, eventType, recipientId) and back it with Redis (SET NX EX) so it is shared and survives restarts; otherwise rely on the notification_log dedup index and drop the in-memory coalescer.

### loadMutedEventTypes loads the entire user_notification_preferences table on every event
- **Area:** notifications · **Category:** performance · **Effort:** small · **Confidence:** high
- **Where:** apps/api/src/services/notifications/notification-pipeline.ts:86-110
- **Problem:** For each domain event, it does a full unfiltered SELECT of all rows from user_notification_preferences and builds a map, instead of filtering to the actual recipient userIds being processed (which are already known in allRecipientIds). The referee-recipient branch additionally looks up muted types using the refereeId string ('referee:123') as if it were a userId key, so referee muting never matches (the map is keyed by userId, not 'referee:'+id).
- **Impact:** Unbounded table scan per event as the user base grows; referee-targeted muting is silently ineffective. Also swallows all errors with a debug log, hiding misconfiguration.
- **Fix:** Constrain the query with inArray(userId, resolvedUserIds). Resolve referee recipients to their userId (as recipient-resolver already does) before muting lookup so 'referee:' recipients can actually be muted. Narrow the catch to expected errors.

### retryFailedNotification only rewrites the in-app row; it never re-attempts push/whatsapp delivery
- **Area:** notifications · **Category:** architecture · **Effort:** medium · **Confidence:** high
- **Where:** apps/api/src/services/admin/notification-admin.service.ts:145-219
- **Problem:** The retry handler re-renders the message and flips status to 'sent' with a new sentAt, but performs no actual channel send — the comment even says 'For now, we update the existing entry'. For a failed push (status 'failed' from Expo), this marks it 'sent' without sending anything, and for whatsapp it does nothing either. It also doesn't route by channel type.
- **Impact:** Operators get a false 'retry succeeded' for push/whatsapp failures; the notification is never actually re-delivered. Misleading delivery guarantees.
- **Fix:** Route retry through the same channel adapter as the original (dispatchImmediate / pushAdapter / whatsAppGroupAdapter) based on the channel_config.type, and only mark sent on a real success. For push, re-enqueue rather than mutating status in place.

### WhatsApp group adapter posts to WAHA with no auth, no retry, and undocumented env vars
- **Area:** notifications · **Category:** security · **Effort:** small · **Confidence:** medium
- **Where:** apps/api/src/services/notifications/channels/whatsapp-group.ts:18-26, apps/api/src/config/env.ts:28-29
- **Problem:** The adapter fires a bare fetch to ${WAHA_BASE_URL}/api/sendText with only Content-Type — no API key/bearer even though WAHA supports one — and no retry/timeout (unlike the Expo client). WAHA_BASE_URL/WAHA_SESSION are validated in env.ts but absent from CLAUDE.md's env documentation, and seed-referee-watch-rule.ts auto-seeds an (disabled) whatsapp_group config + an enabled watch rule, coupling a third-party self-hosted dependency into the default data set.
- **Impact:** If WAHA is exposed without network isolation, the unauthenticated call is a sending vector; transient failures aren't retried so group messages are lost on a blip; undocumented env vars are operational drift. The whatsapp_group channel is also the least portable (self-hosted WAHA + manual groupId), a coupling risk for a club platform.
- **Fix:** Add an optional WAHA_API_KEY bearer header, reuse a fetchWithRetry/timeout helper (extract the one in expo-push.client), document WAHA_* in CLAUDE.md, and consider seeding the watch rule as disabled until the channel is configured.

### Heavy per-channel template duplication; in-app and push templates re-encode the same events independently
- **Area:** notifications · **Category:** code-style · **Effort:** large · **Confidence:** medium
- **Where:** apps/api/src/services/notifications/templates/match.ts:61-73, apps/api/src/services/notifications/templates/push/match-cancelled.ts:14-36, apps/api/src/services/notifications/templates/referee.ts:12-59, apps/api/src/services/notifications/templates/push/referee-assigned.ts:16-41, apps/api/src/services/notifications/templates/utils.ts:5-13, apps/api/src/services/notifications/templates/push/_utils.ts:7-14
- **Problem:** There are two parallel template trees (render-chain templates for in_app/whatsapp and templates/push/* for push) that hand-encode the same events and the same de/en strings, plus two separate formatDate implementations (utils.ts produces DD.MM. with no year, push/_utils produces DD.MM.YYYY) and two truncate conventions. The same matchup/'vs.' formatting and emoji titles are copy-pasted across files. i18n is hardcoded ternaries (locale === 'de' ? ... : ...) inline in every renderer rather than a message catalog.
- **Impact:** Adding or correcting one event's copy means editing 2-4 files; date formats already diverge between channels for the same event; the inline-ternary i18n won't scale beyond de/en and can't be handed to translators. This is the main maintainability tax in the subsystem.
- **Fix:** Move user-facing strings into a keyed message catalog (the project already uses translation files) and have both in-app and push renderers select fields from one typed payload, differing only in length caps and the data/deepLink envelope. At minimum unify the two formatDate/truncate helpers.

### audience:admin in-app notification is a single shared row, not per-admin, breaking read state
- **Area:** notifications · **Category:** data-model · **Effort:** medium · **Confidence:** high
- **Where:** apps/api/src/services/notifications/notification-pipeline.ts:227, apps/api/src/services/notifications/channels/in-app.ts:8-24, apps/api/src/services/admin/notification-admin.service.ts:100-108
- **Problem:** For admin events the in_app adapter writes one notification_log row with recipientId='audience:admin'. The dedup index then prevents a second row for the same event+config. There is no per-admin fan-out, so read/unread state (markRead sets a single row to read) is global: when one admin reads it, it is read for all, and getUnreadCount (which filters by bare userId) can't see it at all.
- **Impact:** Admin in-app inbox has shared, incorrect read state and is invisible to the per-user unread-count query. Combined with the recipientId-format finding, the admin in-app inbox does not work as a per-user inbox.
- **Fix:** Fan out audience:* in-app notifications to one row per resolved user (recipient-resolver already maps audience:admin to userIds), so read state and unread counts are per-user; keep group semantics only for genuinely shared channels like whatsapp_group.

### Social post fonts are downloaded from GCS on the render hot path, diverging from the design
- **Area:** subsystems · **Category:** performance · **Effort:** small · **Confidence:** high
- **Where:** apps/api/src/services/social/social-image.service.ts:24-42, docs/superpowers/specs/2026-03-11-instagram-post-generator-design.md:60
- **Problem:** The design says fonts are 'loaded once at startup as ArrayBuffer from apps/api/src/assets/social/'. The implementation instead lazy-loads four font files from GCS via downloadFromGcs on first generate() and caches them in a module-level fontPromise. The promise is cached, but it is populated inside the request that triggers the first generation, so that request pays four serial GCS round-trips before Satori can run; and the cache is per-process, so every cold Cloud Run instance repeats it.
- **Impact:** First social-post generation per instance is slow and can fail the whole request if GCS hiccups (the fonts are static club assets that never change). It also couples a deterministic build-time asset to a network dependency, and contradicts the documented stateless-asset plan.
- **Fix:** Bundle the four fonts as committed repo assets (or fs-read at boot) and load them eagerly at module init, keeping GCS only for user-uploaded backgrounds/player photos. If GCS must stay, warm the font cache at startup rather than on first request.

### All three subsystems are web-only; native (the app that matters) has no scoreboard, overlay, or social surface
- **Area:** subsystems · **Category:** consistency · **Effort:** medium · **Confidence:** medium
- **Where:** apps/web/src/app/[locale]/live/scoreboard-live.tsx:1, apps/web/src/app/[locale]/overlay/overlay-client.tsx:1, apps/native/src/app/(tabs)/tools.tsx:19
- **Problem:** The live scoreboard, broadcast overlay, and social generator are implemented entirely in apps/web. apps/native references 'social' only as a tools menu label (tools.tsx:19) and consumes none of the scoreboard/broadcast SSE streams. The shared types (StramatelSnapshot, BroadcastState in packages/shared) are reused by the API and web, but the consuming UI logic — SSE handling, FIBA foul/timeout pip rules in scoreboard-live.tsx:14-23 — lives only in the web client.
- **Impact:** The stated goal names a live scoreboard among the things the platform covers and declares native THE mobile app that matters. A club member following a game from their phone gets nothing in the native app. When native does add a live view, the FIBA rules and SSE-consume logic will be re-implemented (duplicated across clients) unless extracted now.
- **Fix:** Decide explicitly whether live/overlay are native concerns. If yes, extract the FIBA pip rules and SSE-snapshot decoding into packages/shared (or a hook in packages/api-client) so both clients share them. If intentionally web-only (overlay is OBS-targeted, reasonably web-only), document that scoping in AGENTS.md so it reads as a decision, not an omission.

### Three coexisting error-handling patterns in the API, including stringly-typed domain errors
- **Area:** style-testing · **Category:** consistency · **Effort:** medium · **Confidence:** high
- **Where:** apps/api/src/middleware/error.ts (central handler for ZodError/HTTPException/Error), apps/api/src/services/admin/team-admin.service.ts:88 `throw new Error("DUPLICATE_TEAM_ID")` + apps/api/src/routes/admin/team.routes.ts:51-53 (matches on `err.message`), apps/api/src/services/referee/referee-assignment.service.ts:21 (AssignmentError class) + apps/api/src/routes/referee/assignment.routes.ts:80-82 / admin/referee-assignment.routes.ts:58 (per-route instanceof mapping), apps/api/src/services/admin/referee-admin.service.ts:12 (RefereeSettingsError with code union)
- **Problem:** Domain errors flow three different ways: (1) a central errorHandler that only knows ZodError/HTTPException/generic Error; (2) typed custom error classes (AssignmentError, RefereeSettingsError, BroadcastError) mapped to status codes by hand in each route via `instanceof`; (3) plain `throw new Error("DUPLICATE_TEAM_ID")` whose 'code' is the message string, recovered in the route with `code === "DUPLICATE_TEAM_ID"` string comparison. Routes never use HTTPException (0 occurrences) and never throw new Error (0), so all mapping is bespoke per handler.
- **Impact:** The stringly-typed variant is fragile — renaming an error message silently changes the HTTP contract, and there is no compiler check linking service errors to route handling. The duplicated `instanceof AssignmentError` block is copy-pasted across 6 handlers in two files. New endpoints have no canonical pattern to copy, so the inconsistency compounds.
- **Fix:** Standardize on typed error classes with a `code` union (the RefereeSettingsError pattern) and teach the central errorHandler to map a `DomainError` base class's code to a status, removing per-route try/catch mapping. Eliminate the `throw new Error("CODE")` string-as-code idiom.

### Web client is thinly tested relative to its size, with several near-trivial tests
- **Area:** style-testing · **Category:** testing · **Effort:** large · **Confidence:** medium
- **Where:** apps/web: 31 test files / 192 source files, apps/web/src/app/[locale]/admin/scoreboard/scoreboard-debug.test.tsx (1 expect call), apps/web/src/app/[locale]/overlay/overlay-client.test.tsx (2 expect calls), apps/web/src/components/admin/referee-hub/referees/profile-subtab.test.tsx / history-subtab.test.tsx (3 expect calls each), apps/web/src/app: 6 test files for 32 page.tsx/route.ts
- **Problem:** Web testing skews toward hooks and small components; whole page/route trees (32 pages/handlers, 6 tested) and the largest components are untested. Several existing tests carry only 1–4 assertions and read as smoke tests rather than behavioral coverage. With no coverage gate (see separate finding) there's nothing pulling this up.
- **Impact:** The admin surface — match editing, notifications, bookings — is the operational heart of the platform and is largely unverified. Regressions here surface as broken admin workflows.
- **Fix:** Prioritize behavioral tests for the high-traffic admin flows and the largest components (match-edit-sheet, event-browser, watch-rules-list), and add a coverage threshold so the gap can't silently widen.

### match-edit-sheet.tsx is a 1040-line god-component
- **Area:** style-testing · **Category:** architecture · **Effort:** large · **Confidence:** medium
- **Where:** apps/web/src/components/admin/matches/match-edit-sheet.tsx (1040 lines, 8 useState, 3 useEffect, ~21 hook/handler declarations, eslint-disable react-hooks/exhaustive-deps at :302), apps/native/src/components/AssignRefereeModal.tsx (687 lines), apps/native/src/components/board/TaskCard.tsx (624 lines), apps/web/src/components/admin/notifications/event-browser.tsx (658 lines)
- **Problem:** The largest non-test source file is a single 1040-line React component mixing form state, data fetching, validation, and multiple sub-sections, with an exhaustive-deps suppression at line 302. Several other UI components exceed 600 lines. These are the hardest files to test (and indeed match-edit-sheet is untested) and to extend.
- **Impact:** God-components concentrate change risk, make review and AI-navigation harder, and are why coverage is thin exactly where the platform's core admin workflow lives. The exhaustive-deps disable is a latent stale-closure bug.
- **Fix:** Decompose match-edit-sheet into a form hook (state/validation) plus presentational sub-sections, mirroring how the referee-hub area is already split into subtabs. Same treatment for AssignRefereeModal and event-browser. This unblocks testing them.

## Low severity (39)

- **knip.json ignores expo-system-ui, a dependency not present in apps/native/package.json** — _layout/dead-code_ — knip.json:33, apps/native/package.json:13-50
- **apps/pi is a Python/systemd app living under apps/* with no package.json or TS** — _layout/layout_ — apps/pi/Panel2Net.py, apps/pi/panel2net.service, apps/pi/requirements.txt
- **Period scores denormalized into 24 fixed `homeQ1..guestOt2` columns instead of a periods child table** — _db/data-model_ — packages/db/src/schema/matches.ts:51-73
- **`domain_events.entity_id` is a single integer, but entities span integer and text PKs** — _db/domain-modeling_ — packages/db/src/schema/domain-events.ts:24-25
- **dataHash change-detection hashes JSON.stringify output with no schema version, risking silent stale-skips** — _db/data-model_ — apps/api/src/services/sync/hash.ts, packages/db/src/schema/matches.ts:90, packages/db/src/schema/teams.ts:27, packages/db/src/schema/referee-games.ts:48
- **AGENTS.md data-model docs drifted from the actual schema (match_referees constraint, RBAC roles, JSONB fields)** — _db/doc-drift_ — AGENTS.md:39, AGENTS.md:105-111, AGENTS.md:88, AGENTS.md:527-533, packages/db/src/schema/referees.ts:57, packages/shared/src/rbac.ts:62
- **Inconsistent FK reference targets: matches/standings point at a non-PK unique column (`api_team_permanent_id`)** — _db/consistency_ — packages/db/src/schema/matches.ts:29-30, packages/db/src/schema/standings.ts:20, packages/db/src/schema/referee-games.ts:44-45
- **Several FKs use default ON DELETE NO ACTION where orphan/cleanup intent is unclear** — _db/data-model_ — packages/db/src/schema/matches.ts:28, packages/db/src/schema/matches.ts:31, packages/db/src/schema/auth.ts:14, packages/db/src/schema/notification-log.ts:22, packages/db/src/schema/broadcast-configs.ts:13
- ***.schemas.ts convention applied to only ~60% of routes; the rest inline z.object in the handler file** — _api-arch/consistency_ — apps/api/src/routes/admin/broadcast.routes.ts:25-34, apps/api/src/routes/admin/settings.routes.ts (inline z.object), apps/api/src/routes/admin/user.routes.ts (inline), apps/api/src/routes/admin/referee-assignment.routes.ts (inline), apps/api/src/routes/admin/scoreboard.routes.ts:19-23, AGENTS.md:490 (Validation schemas: routes/admin/*.schemas.ts)
- **Public scoreboard /latest accepts any deviceId without checking SCOREBOARD_DEVICE_ID (enumeration surface)** — _api-arch/security_ — apps/api/src/routes/public/scoreboard.routes.ts:24-40 (/latest), apps/api/src/routes/public/scoreboard.routes.ts:50-71 (/stream, validates deviceId)
- **Scoreboard correctly split 3 ways (api/public/admin) but the route grouping rationale isn't obvious from structure alone** — _api-arch/architecture_ — apps/api/src/routes/api/scoreboard.routes.ts (ingest, bearer key), apps/api/src/routes/public/scoreboard.routes.ts (latest+stream, no auth), apps/api/src/routes/admin/scoreboard.routes.ts (snapshots+health, admin role), apps/api/src/routes/index.ts:62,68,73
- **Unsafe casts at every auth boundary defeat the typed session model** — _rbac/code-style_ — apps/api/src/middleware/rbac.ts:47 (c.get('user') as { id: string }), apps/api/src/middleware/rbac.ts:68,83,88,105 (session.user as {...} repeated), apps/native/src/lib/auth-client.ts:49 ((session?.user ?? null) as GateUser), apps/native/src/app/admin/_layout.tsx:10 (as { role?: string|null }), apps/native/src/app/officiating.tsx:168-172 (cast inline), apps/web/src/components/rbac/can.tsx:19 (can(session.user, ...) — session.user typed loosely)
- **broadcast/social/notification surfaces all gated on the generic settings:view, conflating unrelated capabilities** — _rbac/domain-modeling_ — packages/shared/src/nav-surfaces.ts:32-41 (broadcast, createPost, notifications, watchRules, channels, domainEvents all -> can(u,'settings','view')), packages/shared/src/rbac.ts:10-16 (no broadcast/social/notification resources in the statement)
- **CLAUDE.md omits native/api-client/mobile/pi and the dual-engine RBAC reality** — _rbac/doc-drift_ — CLAUDE.md (Monorepo Structure lists only web/api/ui/sdk/db/shared), AGENTS.md:493-542 (RBAC section describes can() as 'the' check, doesn't mention userHasPermission is the actual backend enforcement engine), apps/native/* (15.6k lines undocumented in CLAUDE.md), apps/mobile/* (legacy Capacitor shell, still present), apps/pi/Panel2Net.py (real 16KB Python sender, not a TS stub)
- **sdk check-types drift detector and api-client/shared coverage are not wired into CI** — _shared/testing_ — packages/sdk/package.json:11-15, packages/sdk/src/scripts/check-types.ts:1-8, packages/api-client/vitest.config.ts, packages/shared/vitest.config.ts
- **shared/index.ts barrel has redundant double-export and unbounded export * surface** — _shared/code-style_ — packages/shared/src/index.ts:141-142, packages/shared/src/index.ts:226, packages/shared/src/index.ts:153-164
- **apps/mobile (Capacitor) is dead weight alongside the real apps/native** — _shared/dead-code_ — apps/mobile, apps/native
- **Missing native theme tokens force an `as unknown` cast and hardcoded hex fallbacks** — _native/code-style_ — apps/native/src/components/board/TaskCard.tsx:125 (((colors as unknown) as { warning?: string }).warning ?? "#f59e0b"), apps/native/src/theme/colors.ts (no warning/success tokens defined), apps/native/src/components/board/AddColumnSheet.tsx:13-22 (COLOR_PRESETS hardcoded hex), apps/native/src/components/board/ColumnSettingsSheet.tsx:22-29 (same COLOR_PRESETS list duplicated)
- **Expired-session 401 recovery does not unregister the device push token, orphaning it server-side** — _native/security_ — apps/native/src/lib/api.ts:18-34 (handleUnauthorized: signOut + clear SWR + replace("/"), no unregisterForPush), apps/native/src/app/profile.tsx:40-41 (explicit sign-out DOES unregisterForPush before signOut), apps/native/src/lib/push/registration.ts:53 (unregisterForPush requires auth — must run before session clears)
- **AGENTS.md/CLAUDE.md document only web's frontend tree; native, api-client are undocumented (doc drift)** — _native/doc-drift_ — AGENTS.md:516 ("### Frontend (web & native)" header, but content is web-only), AGENTS.md:544-555 ("Frontend Architecture / Page Structure" lists only web app/ — page.tsx, providers.tsx, auth/[path] — no apps/native expo-router tree), CLAUDE.md monorepo-structure block (lists web/api/ui/sdk/db/shared; omits apps/native, apps/mobile, apps/pi, packages/api-client)
- **Today/officiating refetch all active referee games with limit:500 client-side; flagged as a risk in the design but unaddressed** — _native/performance_ — apps/native/src/lib/today/providers/referee.ts:16-17 (refereeApi.getGames({status:"active",limit:500}) then client-side filter for open slots + next assignment), apps/native/src/app/officiating.tsx:187 (same limit:500 fetch), docs/superpowers/specs/2026-05-20-native-role-aware-shell-design.md:180 ("Today provider performance... many active providers... Plan should batch or lazy-load"), docs/superpowers/specs/2026-05-20-native-role-aware-shell-design.md:123 (boards "assigned-to-me" provider deferred for lack of a read endpoint)
- **Match.created event uses falsy Number(...) coercion that turns a legitimate score of 0 into wrong payload values** — _sync-events/code-style_ — apps/api/src/services/sync/matches.sync.ts:563-583
- **Sync orchestrator runs five entity syncs in Promise.all with no per-step isolation, so one rejection aborts the whole batch** — _sync-events/architecture_ — apps/api/src/services/sync/index.ts:111-122, apps/api/src/services/sync/index.ts:312-348
- **syncRuns/syncRunEntries cleanup and stale-run reaping race across multiple worker instances** — _sync-events/architecture_ — apps/api/src/workers/index.ts:24-52, apps/api/src/workers/index.ts:245-260, apps/api/src/workers/queues.ts:101-102
- **Per-match transaction-per-row in matches.sync creates heavy transaction churn and an unindexed enqueuedAt poller scan dependency** — _sync-events/performance_ — apps/api/src/services/sync/matches.sync.ts:351-534, packages/db/src/schema/domain-events.ts:11-43
- **event.worker triggers per_sync digests using configs from a sync.completed event whose entityType is a sentinel 'match'/entityId 0** — _sync-events/domain-modeling_ — apps/api/src/services/sync/index.ts:289-305, apps/api/src/workers/event.worker.ts:44-49, packages/shared/src/domain-events.ts:5
- **Notification inbox endpoints trust ?userId from the query string (IDOR) and have no per-row ownership check** — _notifications/security_ — apps/api/src/routes/admin/notification.routes.ts:36-39, apps/api/src/routes/admin/notification.routes.ts:79-83, apps/api/src/routes/admin/notification.routes.ts:96-98, apps/api/src/services/admin/notification-admin.service.ts:100-125
- **AGENTS.md and CLAUDE.md drift from the implemented notification reality** — _notifications/doc-drift_ — AGENTS.md:637-654, apps/api/src/config/env.ts:28-29, apps/api/src/services/notifications/templates/push/index.ts:30-50
- **Wildcard event-type matching has no namespace boundary (match.* could match unintended longer types)** — _notifications/domain-modeling_ — apps/api/src/services/notifications/rule-engine.ts:42-47
- **The three subsystems each invented their own real-time/storage pattern instead of sharing one** — _subsystems/architecture_ — apps/api/src/services/scoreboard/pubsub.ts:72-109, apps/api/src/services/broadcast/publisher.ts:160-165, apps/api/src/services/social/gcs-storage.service.ts:1-16, apps/api/src/services/broadcast/publisher.ts:30, apps/api/src/services/scoreboard/connection-cap.ts:1-5
- **Generated social posts are never persisted or tracked — no history, no idempotency** — _subsystems/data-model_ — apps/api/src/routes/admin/social.routes.ts:130-182, packages/db/src/schema/social-backgrounds.ts:1, packages/db/src/schema/player-photos.ts:1
- **clockSeconds in the dedupe set writes one snapshot row per second of a running clock** — _subsystems/data-model_ — apps/api/src/services/scoreboard/ingest.ts:25-37, docs/superpowers/specs/2026-04-29-stramatel-live-scoreboard-design.md:122
- **Ingest reads broadcastConfigs on every frame with a non-transactional follow-up query** — _subsystems/performance_ — apps/api/src/services/scoreboard/ingest.ts:129-143
- **Stramatel ingest body limit is enforced after auth+rate-limit middleware** — _subsystems/security_ — apps/api/src/routes/api/scoreboard.routes.ts:9-34, apps/api/src/middleware/ingest-key.ts:24-52
- **Doc drift: AGENTS.md omits the broadcast subsystem entirely from endpoints and data model** — _subsystems/doc-drift_ — AGENTS.md:417-421, AGENTS.md:477-487, apps/api/src/routes/index.ts:74-75, packages/db/src/schema/broadcast-configs.ts:11
- **ERROR_STATUS_MAP forces `status as never` casts, repeated 6 times** — _style-testing/code-style_ — apps/api/src/routes/referee/assignment.routes.ts:82,117,143, apps/api/src/routes/admin/referee-assignment.routes.ts:58,88,116
- **Stray console.log of build-time deviceId in production web page** — _style-testing/code-style_ — apps/web/src/app/[locale]/admin/scoreboard/page.tsx:4 `console.log("deviceId", deviceId);`
- **Native file naming (PascalCase) diverges from CLAUDE.md's lowercase-hyphen rule — doc drift** — _style-testing/doc-drift_ — CLAUDE.md "File Naming" section ("All lowercase with hyphens"), apps/native/src/components/*.tsx — 50 PascalCase files (AssignRefereeModal.tsx, TaskCard.tsx, Screen.tsx, board/BoardColumn.tsx, ...), apps/web/src/components: 0 PascalCase files (web follows the rule)
- **apps/mobile (Capacitor) is dead legacy weight still wired into the workspace** — _style-testing/dead-code_ — apps/mobile/ (capacitor.config.ts, src/index.ts, full android/ + ios/ native projects), knip.json:35 ignores apps/mobile/** (already acknowledged as untracked-by-tooling), apps/mobile/package.json (no test/lint/typecheck — only cap:* scripts)
