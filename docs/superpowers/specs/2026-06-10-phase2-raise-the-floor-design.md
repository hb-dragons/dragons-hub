# Phase 2 — Raise the Floor (design)

Date: 2026-06-10
Source: `docs/2026-06-08-architecture-audit.md`, "Phase 2 — raise the floor (parallel)".

## Goal

The 2026-06-08 architecture audit found the testing/quality investment is inverted:
`apps/api` has ~162 test files and a 90/95 coverage gate, while `apps/native` — the
priority client — has zero tests, no real linter, and looser type strictness than every
other package. Eight of nine packages alias `lint` to `tsc --noEmit`, and coverage is
gated on `apps/api` only.

Phase 2 raises the floor across the monorepo so new native code, shared business logic,
and the web admin surface all sit behind real guardrails before Phase 3 consolidation
work begins.

This phase is tooling and test infrastructure. It does not change runtime behavior except
where stricter types or lint rules surface latent bugs (which are fixed when found).

## Decisions (locked during brainstorming)

1. **Native test runner: vitest, logic-first.** Keep one test runner across all packages.
   Test high-value pure logic by mocking `react-native`/`expo-*`/SWR. Defer React Native
   component and screen rendering (no `jest-expo` in the monorepo this phase).
2. **ESLint rollout: bug-class as errors.** One shared flat config. Correctness rules are
   errors; stylistic rules are warnings. CI fails on errors only. Fix error-level
   violations in this phase; leave warnings to ratchet later. `lint` (eslint) is split
   from `typecheck` (tsc).
3. **Coverage gates: measured-floor baseline.** Add coverage scripts to the ungated
   packages, set thresholds just under current measured coverage, and fail CI if a package
   that has tests lacks a `coverage` script. Ratchet up over time. Same pattern Phase 1
   used for `@dragons/api-client`.

## Workstreams

Four independent workstreams, each landed as its own green commit.

### A. Native test harness (vitest, logic-first)

- Add `apps/native/vitest.config.ts`: `environment: "node"`, `include: ["src/**/*.test.ts"]`,
  a `setupFiles` entry, and module aliases that stub native-only modules (`react-native`,
  `expo-*`, and anything that transitively pulls Metro/RN internals into the node runtime).
- Add `apps/native/test/setup.ts` with shared mocks (SWR fetcher, `expo-notifications`,
  `expo-device`, `auth-client`) so individual tests stay small.
- Add `test` and `coverage` scripts to `apps/native/package.json` so `turbo test` /
  `turbo coverage` stop skipping native.
- Initial test targets (the audit's named high-value, mostly-pure logic):
  - `src/lib/today/providers/referee.ts` and `club.ts` — item derivation from mocked SWR data.
  - `src/lib/today/registry.ts` — provider aggregation / ordering.
  - `src/lib/api.ts` — 401 dedup/recovery path.
  - `src/lib/tools/surfaces.ts` and `src/lib/nav/tabs.ts` — role-aware selection.
  - `src/lib/push/registration.ts` — register/unregister with mocked expo modules.
  - Board drop-math hooks (`src/hooks/board/useMoveTask.ts`, `useColumnDrag.ts`) for the
    math that is not already covered by `@dragons/shared/board-dnd`.
- Out of scope: RN component/screen rendering, hooks that require a rendered RN tree.
  These are deferred to a possible later `jest-expo` follow-up.

### B. Native `tsconfig.base` adoption

- `apps/native/tsconfig.json` extends **both** `../../tsconfig.base.json` and
  `expo/tsconfig.base`, bringing native to the same strictness as every other package
  (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `noFallthroughCasesInSwitch`,
  `forceConsistentCasingInFileNames`).
- **Fix-up is unbounded until measured.** Procedure: enable the combined config, run
  `tsc --noEmit`, and report the error count and shape before mass-editing. If the fallout
  is small and bounded, fix all of it. If it balloons, land `noUncheckedIndexedAccess`
  (the highest-value, array-access-bug rule) as the must-have for this phase and stage the
  remaining options (e.g. `verbatimModuleSyntax`) as follow-ups, documented in the plan.
- Landed last (see Sequencing) so the native test suite from workstream A is a regression
  net while the stricter types force code changes.

### C. Shared ESLint config

- New root `eslint.config.mjs` (flat config) as the shared base, built on `typescript-eslint`.
  - **Error level:** `@typescript-eslint/no-floating-promises`,
    `@typescript-eslint/no-misused-promises`, `@typescript-eslint/no-unused-vars`
    (with `^_` ignore pattern, matching web today),
    `@typescript-eslint/consistent-type-imports`.
  - **Native additionally:** `react-hooks/rules-of-hooks` (error) and
    `react-hooks/exhaustive-deps` (warn), plus the react-native plugin where useful.
  - Stylistic / lower-value rules: warnings.
- Each package gets `"lint": "eslint ."` distinct from `"typecheck": "tsc --noEmit"`:
  `api`, `native`, `shared`, `db`, `sdk`, `api-client`, `contracts`, `ui`.
- `apps/web` keeps its Next-specific config, rebased to compose the shared base so the rule
  set is consistent.
- `turbo.json` already declares separate `lint` and `typecheck` tasks; no change needed
  there beyond the per-package scripts.
- **Fix-up is unbounded until measured.** Procedure: run eslint per package, report the
  error count, fix error-level violations. A `no-floating-promises` hit in API
  workers/services may be a real un-awaited promise — fix the bug, do not blanket-disable.
  Any rule that proves too noisy to fix this phase is downgraded to warning with a comment,
  not silenced per-line.
- Root devDeps added: `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`,
  `eslint-plugin-react-native` (native), and the shared `eslint/config` helper already used
  by web.

### D. Coverage gates (measured-floor)

- Add a `coverage` block to `packages/shared/vitest.config.ts` with thresholds set just
  under measured current coverage.
- Add `coverage` scripts + thresholds to `apps/web` and `apps/native` (native's floor
  starts low and ratchets as workstream A grows).
- Add `scripts/check-coverage-scripts.mjs`: fail if any workspace package that contains
  `*.test.*` files does not define a `coverage` script. Wire it into CI (and optionally a
  root `check:coverage-scripts` script).
- `@dragons/api-client` already carries a "ratchet up in Phase 2" note on its thresholds;
  bump it to its current measured floor while here.

### CI + docs

- Verify `.github/workflows/ci.yml` runs `pnpm lint` (now real eslint across packages) and
  `pnpm coverage` (now fans out to web/native/shared/contracts/api-client/api). Adjust the
  workflow if any of these are not already invoked.
- Update `CLAUDE.md`: document that `lint` (eslint) and `typecheck` (tsc) are distinct,
  that coverage is now gated per testable package (not api-only), and the native test
  command (`pnpm --filter @dragons/native test`).

## Sequencing

Each step is an independent, individually-green commit:

1. **D — coverage gates.** Lowest risk; establishes the gate before more tests land.
2. **A — native test harness + initial tests.** Raises native's floor from zero.
3. **C — shared ESLint config + error-level fixes.** Real linting across packages.
4. **B — native `tsconfig.base` adoption + type fixes.** Highest unknown; landed last so
   the workstream-A tests catch regressions from the stricter types.

## Non-goals (explicitly deferred)

- React Native component/screen rendering tests (`jest-expo`).
- Raising thresholds to the documented 90/95 bar for web/native/shared (measured-floor now,
  ratchet later).
- Fixing warning-level lint across the codebase (only error-level this phase).
- Deleting `apps/mobile`, splitting `@dragons/shared`, web→api-client migration, enum
  hardening — these are Phase 3.

## Success criteria

- `pnpm test` and `pnpm coverage` exercise native, web, shared (not just api).
- `pnpm lint` runs real eslint in every package and fails on the bug-class rules.
- `apps/native` typechecks under the monorepo base config (at minimum
  `noUncheckedIndexedAccess`).
- CI fails if a testable package lacks a coverage script.
- Whole repo green: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm coverage`,
  `pnpm build`, `pnpm check:ai-slop`.
