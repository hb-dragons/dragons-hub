# Phase 2 — Raise the Floor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `apps/native`, `apps/web`, and `packages/shared` up to the same testing, linting, and type-strictness floor as `apps/api`, so future work sits behind real guardrails.

**Architecture:** Four independent workstreams, each landed as its own green commit, in order D → A → C → B: measured-floor coverage gates, a vitest logic-first native test harness, a shared flat ESLint config with bug-class rules as errors, and native adopting the monorepo's strict tsconfig. Two workstreams (C, B) have an unbounded fix-up that is measured and reported before mass-editing.

**Tech Stack:** pnpm workspaces + Turborepo, Vitest 4 (`@vitest/coverage-v8`), typescript-eslint (flat config), Expo SDK 55 / React Native 0.83 (native, mocked in node-env vitest).

**Source spec:** `docs/superpowers/specs/2026-06-10-phase2-raise-the-floor-design.md`

**Conventions for every task below:**
- Work on a feature branch off `main` (e.g. `feat/phase2-raise-the-floor`). Do not commit to `main` directly.
- After each task, the whole repo must stay green. Quick gate per task: `pnpm typecheck` and the task's own tests. Full gate before declaring a workstream done: `pnpm typecheck && pnpm lint && pnpm test && pnpm coverage && pnpm build && pnpm check:ai-slop`.
- Commit messages: no `Co-Authored-By` / AI-credit trailers (repo rule in CLAUDE.md).

---

## Workstream D — Coverage gates (measured-floor)

### Task D1: Add a coverage gate to `packages/shared`

**Files:**
- Modify: `packages/shared/vitest.config.ts`
- Modify: `packages/shared/package.json`

- [ ] **Step 1: Measure current shared coverage**

Run: `pnpm --filter @dragons/shared exec vitest run --coverage --coverage.provider=v8 --coverage.reporter=text 2>&1 | tail -20`
Expected: a coverage table. Record the four numbers (% Stmts, % Branch, % Funcs, % Lines) from the `All files` row. Call them S, B, F, L.

- [ ] **Step 2: Add a `coverage` script**

In `packages/shared/package.json` scripts, add (keep existing scripts):

```json
"coverage": "vitest run --coverage"
```

- [ ] **Step 3: Add the coverage block with thresholds set just below measured**

Replace `packages/shared/vitest.config.ts` with (substitute the floor numbers — use `Math.floor(measured) - 1` for each, but never below 0):

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      thresholds: {
        // Phase 2 measured floor (2026-06-10) — ratchet up as tests grow.
        branches: B_FLOOR,
        functions: F_FLOOR,
        lines: L_FLOOR,
        statements: S_FLOOR,
      },
    },
  },
});
```

- [ ] **Step 4: Add `@vitest/coverage-v8` devDep if absent**

Run: `grep -q "@vitest/coverage-v8" packages/shared/package.json || pnpm --filter @dragons/shared add -D @vitest/coverage-v8@^4.1.6`

- [ ] **Step 5: Verify the gate passes**

Run: `pnpm --filter @dragons/shared coverage 2>&1 | tail -15`
Expected: PASS — coverage meets the thresholds you set (they are below measured).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/vitest.config.ts packages/shared/package.json pnpm-lock.yaml
git commit -m "test(shared): add measured-floor coverage gate"
```

### Task D2: Add a coverage gate to `apps/web`

**Files:**
- Modify: `apps/web/vitest.config.ts`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Measure current web coverage**

Run: `pnpm --filter @dragons/web exec vitest run --coverage --coverage.provider=v8 --coverage.reporter=text 2>&1 | tail -25`
Expected: a coverage table. Record S/B/F/L from `All files`.

- [ ] **Step 2: Add a `coverage` script**

In `apps/web/package.json` scripts add: `"coverage": "vitest run --coverage"`.

- [ ] **Step 3: Add the coverage block**

In `apps/web/vitest.config.ts`, add a `coverage` block inside `test` (keep the existing config; merge, do not overwrite unrelated keys):

```ts
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.d.ts",
        "src/messages/**",
        "src/i18n/**",
      ],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      thresholds: {
        // Phase 2 measured floor (2026-06-10) — ratchet up over time.
        branches: B_FLOOR,
        functions: F_FLOOR,
        lines: L_FLOOR,
        statements: S_FLOOR,
      },
    },
```

- [ ] **Step 4: Ensure `@vitest/coverage-v8` is a devDep**

Run: `grep -q "@vitest/coverage-v8" apps/web/package.json || pnpm --filter @dragons/web add -D @vitest/coverage-v8@^4.1.6`

- [ ] **Step 5: Verify**

Run: `pnpm --filter @dragons/web coverage 2>&1 | tail -15`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/vitest.config.ts apps/web/package.json pnpm-lock.yaml
git commit -m "test(web): add measured-floor coverage gate"
```

### Task D3: Bump `@dragons/api-client` thresholds to current floor

**Files:**
- Modify: `packages/api-client/vitest.config.ts`

- [ ] **Step 1: Measure current api-client coverage**

Run: `pnpm --filter @dragons/api-client coverage 2>&1 | tail -15`
Expected: PASS, and a table. Record S/B/F/L.

- [ ] **Step 2: Raise thresholds to `floor(measured) - 1`**

In `packages/api-client/vitest.config.ts`, replace the existing threshold numbers (currently branches 86 / functions 78 / lines 85 / statements 85) with the new measured floors. Update the comment to `// Phase 2 floor (2026-06-10).`

- [ ] **Step 3: Verify**

Run: `pnpm --filter @dragons/api-client coverage 2>&1 | tail -8`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/api-client/vitest.config.ts
git commit -m "test(api-client): ratchet coverage thresholds to current floor"
```

### Task D4: CI guard — fail if a tested package has no coverage script

**Files:**
- Create: `scripts/check-coverage-scripts.mjs`
- Modify: `package.json` (root scripts)
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the guard script**

Create `scripts/check-coverage-scripts.mjs`:

```js
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["apps", "packages"];

function hasTestFile(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === ".next") continue;
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (hasTestFile(full)) return true;
    } else if (/\.test\.(ts|tsx)$/.test(entry)) {
      return true;
    }
  }
  return false;
}

const offenders = [];
for (const root of ROOTS) {
  if (!existsSync(root)) continue;
  for (const pkg of readdirSync(root)) {
    const pkgDir = join(root, pkg);
    const pkgJsonPath = join(pkgDir, "package.json");
    const srcDir = join(pkgDir, "src");
    if (!existsSync(pkgJsonPath)) continue;
    const dirToScan = existsSync(srcDir) ? srcDir : pkgDir;
    if (!hasTestFile(dirToScan)) continue;
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    if (!pkgJson.scripts?.coverage) {
      offenders.push(pkgJson.name ?? pkgDir);
    }
  }
}

if (offenders.length > 0) {
  console.error(
    "These packages have *.test.* files but no `coverage` script:\n  " +
      offenders.join("\n  "),
  );
  process.exit(1);
}
console.log("Coverage-script check passed.");
```

- [ ] **Step 2: Run it — expect PASS now that shared/web/api/api-client/contracts all have coverage scripts**

Run: `node scripts/check-coverage-scripts.mjs`
Expected: `Coverage-script check passed.` (Note: `apps/native` has no test files yet, so it is not yet required — that becomes required in Task A4.)

- [ ] **Step 3: Add a root script**

In root `package.json` scripts add: `"check:coverage-scripts": "node scripts/check-coverage-scripts.mjs"`.

- [ ] **Step 4: Wire into CI**

In `.github/workflows/ci.yml`, in the `test` job, add a step BEFORE `Coverage`:

```yaml
      - name: Coverage-script check
        run: pnpm check:coverage-scripts
```

Also change the `Upload coverage reports` step's `path:` from `apps/api/coverage` to capture all packages:

```yaml
        with:
          name: coverage-reports
          path: |
            apps/*/coverage
            packages/*/coverage
          if-no-files-found: warn
```

- [ ] **Step 5: Commit**

```bash
git add scripts/check-coverage-scripts.mjs package.json .github/workflows/ci.yml
git commit -m "ci: fail when a tested package lacks a coverage script"
```

---

## Workstream A — Native test harness (vitest, logic-first)

### Task A1: Scaffold the native vitest harness

**Files:**
- Create: `apps/native/vitest.config.ts`
- Create: `apps/native/test/setup.ts`
- Modify: `apps/native/package.json`

- [ ] **Step 1: Add devDeps**

Run: `pnpm --filter @dragons/native add -D vitest@^4.1.6 @vitest/coverage-v8@^4.1.6`

- [ ] **Step 2: Write the vitest config**

Create `apps/native/vitest.config.ts`. The `@` alias mirrors the tsconfig path so `@/lib/...` imports resolve. Node environment; native modules are mocked per-test (not globally aliased) so each test declares exactly what it stubs.

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/lib/i18n.ts"],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      thresholds: {
        // Phase 2 starting floor — ratchet up as native tests grow.
        branches: 0,
        functions: 0,
        lines: 0,
        statements: 0,
      },
    },
  },
});
```

- [ ] **Step 3: Write the shared setup file**

Create `apps/native/test/setup.ts` (kept minimal; per-test `vi.mock` calls do the heavy lifting):

```ts
import { vi } from "vitest";

// expo-router is a singleton imported at module load by several lib files.
vi.mock("expo-router", () => ({
  router: { replace: vi.fn(), push: vi.fn(), back: vi.fn() },
}));
```

- [ ] **Step 4: Add a smoke test to prove the harness runs**

Create `apps/native/src/lib/nav/tabs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TAB_CONFIG } from "@/lib/nav/tabs";

describe("TAB_CONFIG", () => {
  it("defines a config for every tab id with a route name and label key", () => {
    for (const [id, cfg] of Object.entries(TAB_CONFIG)) {
      expect(cfg.name, `${id}.name`).toBeTruthy();
      expect(cfg.labelKey, `${id}.labelKey`).toMatch(/^tabs\./);
    }
  });

  it("maps home to the index route", () => {
    expect(TAB_CONFIG.home.name).toBe("index");
  });
});
```

- [ ] **Step 5: Run it**

Run: `pnpm --filter @dragons/native exec vitest run src/lib/nav/tabs.test.ts 2>&1 | tail -15`
Expected: PASS (2 tests).

- [ ] **Step 6: Add `test` and `coverage` scripts**

In `apps/native/package.json` scripts add: `"test": "vitest run"` and `"coverage": "vitest run --coverage"`.

- [ ] **Step 7: Verify turbo now sees native tests**

Run: `pnpm --filter @dragons/native test 2>&1 | tail -8`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/native/vitest.config.ts apps/native/test/setup.ts apps/native/src/lib/nav/tabs.test.ts apps/native/package.json pnpm-lock.yaml
git commit -m "test(native): scaffold vitest harness + tab config test"
```

### Task A2: Test the referee Today provider

**Files:**
- Create: `apps/native/src/lib/today/providers/referee.test.ts`

`useItems` calls `useSWR` (mocked to return fixed data), `refereeApi.getGames` (mocked), and `i18n.t` (mocked to echo). Because `useSWR` is mocked, `useItems` runs as a plain function — no React render. Use far-future/past dates to avoid coupling to the real clock.

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { GateUser } from "@dragons/shared";

vi.mock("swr", () => ({ default: vi.fn() }));
vi.mock("@/lib/api", () => ({
  refereeApi: { getGames: vi.fn() },
}));
vi.mock("@/lib/i18n", () => ({
  i18n: {
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  },
}));

import useSWR from "swr";
import { refereeProvider } from "@/lib/today/providers/referee";

const user = { id: "u1", role: "refereeAdmin" } as unknown as GateUser;

function game(overrides: Record<string, unknown>) {
  return {
    id: 1,
    matchId: null,
    kickoffDate: "2999-01-01",
    homeTeamName: "A",
    guestTeamName: "B",
    mySlot: null,
    isCancelled: false,
    isForfeited: false,
    sr1OurClub: false,
    sr2OurClub: false,
    sr1Status: "open",
    sr2Status: "open",
    ...overrides,
  };
}

function setData(items: unknown[]) {
  (useSWR as unknown as Mock).mockReturnValue({ data: { items } });
}

describe("refereeProvider.useItems", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns no items when SWR has no data yet", () => {
    (useSWR as unknown as Mock).mockReturnValue({ data: undefined });
    expect(refereeProvider.useItems(user)).toEqual([]);
  });

  it("emits an open-slots item counting our-club unassigned slots", () => {
    setData([
      game({ sr1OurClub: true, sr1Status: "open" }),
      game({ sr2OurClub: true, sr2Status: "open" }),
    ]);
    const items = refereeProvider.useItems(user);
    const openSlots = items.find((i) => i.id === "open-slots");
    expect(openSlots).toBeDefined();
    expect(openSlots?.title).toContain('"count":2');
    expect(openSlots?.urgency).toBe(70);
  });

  it("ignores cancelled, forfeited, and past games for open-slot counting", () => {
    setData([
      game({ sr1OurClub: true, sr1Status: "open", isCancelled: true }),
      game({ sr1OurClub: true, sr1Status: "open", kickoffDate: "2000-01-01" }),
    ]);
    expect(
      refereeProvider.useItems(user).find((i) => i.id === "open-slots"),
    ).toBeUndefined();
  });

  it("emits the earliest assigned game as the next assignment", () => {
    setData([
      game({ id: 5, mySlot: "sr1", kickoffDate: "2999-05-05", matchId: 99 }),
      game({ id: 6, mySlot: "sr1", kickoffDate: "2999-02-02", matchId: null }),
    ]);
    const next = refereeProvider
      .useItems(user)
      .find((i) => i.id.startsWith("assignment-"));
    expect(next?.id).toBe("assignment-6");
    expect(next?.route).toBe("/referee-game/6");
    expect(next?.urgency).toBe(80);
  });
});
```

- [ ] **Step 2: Run to verify it passes**

Run: `pnpm --filter @dragons/native exec vitest run src/lib/today/providers/referee.test.ts 2>&1 | tail -15`
Expected: PASS (4 tests). If `@dragons/shared`'s `canViewOpenGames` import pulls anything heavy, it is still node-safe (api tests import shared in node). No change needed.

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/lib/today/providers/referee.test.ts
git commit -m "test(native): cover referee Today provider derivation"
```

### Task A3: Test the club Today provider and the registry

**Files:**
- Create: `apps/native/src/lib/today/providers/club.test.ts`
- Create: `apps/native/src/lib/today/registry.test.ts`

- [ ] **Step 1: Write the club provider test**

Create `apps/native/src/lib/today/providers/club.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { GateUser } from "@dragons/shared";

vi.mock("swr", () => ({ default: vi.fn() }));
vi.mock("@/lib/api", () => ({ publicApi: { getHomeDashboard: vi.fn() } }));
vi.mock("@/lib/i18n", () => ({
  i18n: { t: (k: string, o?: Record<string, unknown>) => (o ? `${k}:${JSON.stringify(o)}` : k) },
}));

import useSWR from "swr";
import { clubProvider } from "@/lib/today/providers/club";

const user = { id: "u1" } as unknown as GateUser;

describe("clubProvider.useItems", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns [] when there is no next game", () => {
    (useSWR as unknown as Mock).mockReturnValue({ data: { nextGame: null } });
    expect(clubProvider.useItems(user)).toEqual([]);
  });

  it("emits a next-game item routed to the game", () => {
    (useSWR as unknown as Mock).mockReturnValue({
      data: { nextGame: { id: 7, homeTeamName: "A", guestTeamName: "B", kickoffDate: "2999-01-01" } },
    });
    const items = clubProvider.useItems(user);
    expect(items).toHaveLength(1);
    expect(items[0]?.route).toBe("/game/7");
    expect(items[0]?.urgency).toBe(40);
  });
});
```

- [ ] **Step 2: Write the registry test**

The registry imports both providers; mock them so the test is about aggregation/visibility only.

Create `apps/native/src/lib/today/registry.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { GateUser, TodayItem } from "@dragons/shared";

const refItems: TodayItem[] = [
  { id: "r1", providerId: "referee", title: "ref", urgency: 80, route: "/officiating", icon: "whistle" },
];
const clubItems: TodayItem[] = [
  { id: "c1", providerId: "club", title: "club", urgency: 40, route: "/game/1", icon: "basketball" },
];

vi.mock("@/lib/today/providers/referee", () => ({
  refereeProvider: { id: "referee", visible: () => true, useItems: () => refItems },
}));
vi.mock("@/lib/today/providers/club", () => ({
  clubProvider: { id: "club", visible: () => true, useItems: () => clubItems },
}));

import { useTodayItems } from "@/lib/today/registry";

const user = { id: "u1" } as unknown as GateUser;

describe("useTodayItems", () => {
  it("aggregates visible providers ordered by urgency (desc)", () => {
    const items = useTodayItems(user);
    expect(items.map((i) => i.id)).toEqual(["r1", "c1"]);
  });
});
```

- [ ] **Step 3: Run both**

Run: `pnpm --filter @dragons/native exec vitest run src/lib/today/providers/club.test.ts src/lib/today/registry.test.ts 2>&1 | tail -15`
Expected: PASS (3 tests). If `orderTodayItems` orders by something other than urgency-desc, adjust the expected order in the registry test to match the real `@dragons/shared` behavior (read `packages/shared/src/today.ts`).

- [ ] **Step 4: Commit**

```bash
git add apps/native/src/lib/today/providers/club.test.ts apps/native/src/lib/today/registry.test.ts
git commit -m "test(native): cover club Today provider + registry aggregation"
```

### Task A4: Test push registration and raise native coverage floor

**Files:**
- Create: `apps/native/src/lib/push/registration.test.ts`
- Modify: `apps/native/vitest.config.ts` (raise thresholds off 0)

- [ ] **Step 1: Write the push registration test**

Create `apps/native/src/lib/push/registration.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-device", () => ({ isDevice: true }));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { eas: { projectId: "proj-1" } } } },
}));
vi.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "de-DE" }] }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-notifications", () => ({
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
}));
vi.mock("../api", () => ({ deviceApi: { register: vi.fn(), unregister: vi.fn() } }));

import * as Notifications from "expo-notifications";
import { deviceApi } from "../api";
import { registerForPush, unregisterForPush } from "@/lib/push/registration";

describe("registerForPush", () => {
  beforeEach(() => vi.clearAllMocks());

  it("registers the token when permission is already granted", async () => {
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "granted" } as never);
    vi.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({ data: "tok-1" } as never);
    await registerForPush();
    expect(deviceApi.register).toHaveBeenCalledWith("tok-1", "ios", "de-DE");
  });

  it("requests permission when not yet granted, then bails if denied", async () => {
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "undetermined" } as never);
    vi.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({ status: "denied" } as never);
    await registerForPush();
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
    expect(deviceApi.register).not.toHaveBeenCalled();
  });
});

describe("unregisterForPush", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes the token from the server", async () => {
    vi.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({ data: "tok-1" } as never);
    await unregisterForPush();
    expect(deviceApi.unregister).toHaveBeenCalledWith("tok-1");
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm --filter @dragons/native exec vitest run src/lib/push/registration.test.ts 2>&1 | tail -15`
Expected: PASS (3 tests).

- [ ] **Step 3: Measure native coverage and raise the floor off zero**

Run: `pnpm --filter @dragons/native coverage 2>&1 | tail -20`
Record S/B/F/L from `All files`. In `apps/native/vitest.config.ts`, set the four `thresholds` to `floor(measured) - 1` (never below 0). Update the comment to `// Phase 2 measured floor (2026-06-10).`

- [ ] **Step 4: Verify the gate passes and the coverage-script guard is satisfied**

Run: `pnpm --filter @dragons/native coverage 2>&1 | tail -8 && node scripts/check-coverage-scripts.mjs`
Expected: coverage PASS, then `Coverage-script check passed.` (native now has tests AND a coverage script).

- [ ] **Step 5: Commit**

```bash
git add apps/native/src/lib/push/registration.test.ts apps/native/vitest.config.ts
git commit -m "test(native): cover push registration; raise coverage floor off zero"
```

### Task A5: Make the api.ts 401 dedup testable and test it

**Files:**
- Create: `apps/native/src/lib/auth/once-guard.ts`
- Create: `apps/native/src/lib/auth/once-guard.test.ts`
- Modify: `apps/native/src/lib/api.ts`

The dedup is currently a private closure in `api.ts`. Extract the "run an async action at most once concurrently" primitive into a tiny pure module, unit-test it, and have `api.ts` use it. This is a refactor with no behavior change.

- [ ] **Step 1: Write the failing test for the extracted guard**

Create `apps/native/src/lib/auth/once-guard.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createOnceGuard } from "@/lib/auth/once-guard";

describe("createOnceGuard", () => {
  it("runs the action once for concurrent callers, then allows a fresh run", async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    const guard = createOnceGuard(action);

    await Promise.all([guard(), guard(), guard()]);
    expect(action).toHaveBeenCalledTimes(1);

    await guard();
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("clears the in-flight latch even if the action throws", async () => {
    const action = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(undefined);
    const guard = createOnceGuard(action);

    await expect(guard()).rejects.toThrow("boom");
    await guard();
    expect(action).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @dragons/native exec vitest run src/lib/auth/once-guard.test.ts 2>&1 | tail -10`
Expected: FAIL — cannot find module `@/lib/auth/once-guard`.

- [ ] **Step 3: Implement the guard**

Create `apps/native/src/lib/auth/once-guard.ts`:

```ts
/**
 * Wraps an async action so that concurrent callers share a single in-flight
 * run. Once the run settles (resolve or reject), the latch clears and the next
 * call starts a fresh run. Used to de-duplicate the 401 sign-out flow.
 */
export function createOnceGuard(action: () => Promise<void>): () => Promise<void> {
  let inFlight: Promise<void> | null = null;
  return () => {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        await action();
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @dragons/native exec vitest run src/lib/auth/once-guard.test.ts 2>&1 | tail -10`
Expected: PASS (2 tests). Note: the second test's first `guard()` rejects; the `finally` still clears the latch, so the latch-clear-on-throw behavior matches the original `api.ts` code.

- [ ] **Step 5: Refactor `api.ts` to use the guard**

In `apps/native/src/lib/api.ts`, remove the `unauthorizedInFlight` variable and the manual latch, and rewrite `handleUnauthorized` using the guard:

```ts
import { createOnceGuard } from "./auth/once-guard";

const handleUnauthorized = createOnceGuard(async () => {
  await authClient.signOut().catch(() => {});
  await globalMutate(() => true, undefined, { revalidate: false });
  router.replace("/");
});
```

Leave the `onResponse` handler calling `await handleUnauthorized()` unchanged.

- [ ] **Step 6: Verify native typecheck + tests still pass**

Run: `pnpm --filter @dragons/native typecheck && pnpm --filter @dragons/native test 2>&1 | tail -10`
Expected: typecheck clean; all native tests PASS.

- [ ] **Step 7: Re-measure and bump the native coverage floor**

Run: `pnpm --filter @dragons/native coverage 2>&1 | tail -12`
If the measured floor rose, bump the thresholds in `apps/native/vitest.config.ts` to the new `floor(measured) - 1`.

- [ ] **Step 8: Commit**

```bash
git add apps/native/src/lib/auth/once-guard.ts apps/native/src/lib/auth/once-guard.test.ts apps/native/src/lib/api.ts apps/native/vitest.config.ts
git commit -m "refactor(native): extract 401 once-guard; unit-test dedup"
```

---

## Workstream C — Shared ESLint config

### Task C1: Add the shared flat ESLint base + root deps

**Files:**
- Create: `eslint.config.base.mjs` (repo root)
- Modify: `package.json` (root devDeps + scripts)

- [ ] **Step 1: Add root devDeps**

Run: `pnpm add -w -D eslint@^9 typescript-eslint@^8 eslint-plugin-react-hooks@^5`

- [ ] **Step 2: Write the shared base config**

Create `eslint.config.base.mjs` at the repo root. It enables typed linting via `projectService` so the two promise rules work, spreads typescript-eslint `recommended`, and sets the bug-class rules to error. Known-noisy stylistic rules are downgraded to warn so the first rollout fails only on the bug-class set.

```js
import tseslint from "typescript-eslint";

/** Shared base for every package. Packages re-export or extend this. */
export const base = tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/.expo/**",
      "**/*.config.{js,mjs,ts}",
    ],
  },
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: { projectService: true },
    },
    rules: {
      // --- bug-class: errors ---
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      // --- stylistic / lower-value: warnings on first rollout ---
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
    },
  },
);
```

- [ ] **Step 3: Commit the base alone (no package wired yet)**

```bash
git add eslint.config.base.mjs package.json pnpm-lock.yaml
git commit -m "build(lint): add shared typescript-eslint flat base"
```

### Task C2: Roll ESLint onto packages one at a time, smallest first

Do this package-by-package so fallout is bounded and attributable. Order: `sdk`, `db`, `contracts`, `api-client`, `shared`, then `api`, then `native`. For EACH package repeat steps 1–5 below before moving on.

**Per-package files:**
- Create: `<pkgdir>/eslint.config.mjs`
- Modify: `<pkgdir>/package.json` (`lint` script)

- [ ] **Step 1: Add the package eslint config**

Create `<pkgdir>/eslint.config.mjs` (adjust the relative path depth: `packages/*` and `apps/*` are both two levels deep, so `../../`):

```js
import { base } from "../../eslint.config.base.mjs";

export default base;
```

For `apps/native`, additionally enable react-hooks:

```js
import { base } from "../../eslint.config.base.mjs";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  ...base,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
```

- [ ] **Step 2: Point the `lint` script at eslint**

In `<pkgdir>/package.json`, change `"lint": "tsc --noEmit"` to `"lint": "eslint ."`. (Keep `"typecheck": "tsc --noEmit"` as-is — they are now distinct.)

- [ ] **Step 3: Measure fallout**

Run: `pnpm --filter <pkgname> lint 2>&1 | tail -40`
Record the error count (the summary line `✖ N problems (E errors, W warnings)`). Warnings do not block; only errors must reach zero.

- [ ] **Step 4: Fix error-level violations**

Fix each error. Guidance by rule:
- `no-floating-promises`: add `await`, or `void` the promise if fire-and-forget is intentional. If the un-awaited promise is in a worker/service hot path, treat a missing `await` as a real bug and verify the surrounding logic, not just silence it.
- `consistent-type-imports`: change `import { Foo }` used only as a type to `import type { Foo }`.
- `no-unused-vars`: remove the unused binding or prefix with `_`.
- `no-misused-promises`: usually an async function passed where a void callback is expected — wrap or mark intentionally.

Do NOT add per-line `eslint-disable` to hit zero. If a rule is genuinely too noisy to fix in this phase for this package, downgrade it to `"warn"` in `eslint.config.base.mjs` with a comment explaining why, and note it in the workstream summary.

- [ ] **Step 5: Verify and commit the package**

Run: `pnpm --filter <pkgname> lint 2>&1 | tail -8`
Expected: `0 errors`.

```bash
git add <pkgdir>/eslint.config.mjs <pkgdir>/package.json <pkgdir>/src
git commit -m "lint(<pkgname>): adopt shared eslint config"
```

Repeat Task C2 for the next package in the order until all are done.

### Task C3: Rebase web's ESLint config on the shared base

**Files:**
- Modify: `apps/web/eslint.config.mjs`

- [ ] **Step 1: Compose the shared base into web's config**

Edit `apps/web/eslint.config.mjs` to spread the shared base alongside the existing Next configs (keep the Next plugins and the existing `globalIgnores`):

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import { base } from "../../eslint.config.base.mjs";

export default defineConfig([
  ...base,
  ...nextCoreWebVitals,
  ...nextTypeScript,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
]);
```

- [ ] **Step 2: Measure and fix web fallout**

Run: `pnpm --filter @dragons/web lint 2>&1 | tail -40`
Fix any NEW errors introduced by the shared base (the two promise rules + consistent-type-imports). Web already passed its own config, so expect a small set. Follow the same fix guidance as Task C2 Step 4.

- [ ] **Step 3: Verify and commit**

Run: `pnpm --filter @dragons/web lint 2>&1 | tail -8`
Expected: `0 errors`.

```bash
git add apps/web/eslint.config.mjs apps/web/src
git commit -m "lint(web): compose shared eslint base into next config"
```

### Task C4: Full lint gate green

- [ ] **Step 1: Run the whole lint task**

Run: `pnpm lint 2>&1 | tail -20`
Expected: all packages `0 errors`. Fix any cross-package stragglers.

- [ ] **Step 2: Commit any fixes**

```bash
git add -A
git commit -m "lint: resolve remaining error-level violations across workspace"
```

---

## Workstream B — Native `tsconfig.base` adoption

### Task B1: Enable the high-value strict flags and measure fallout

**Files:**
- Modify: `apps/native/tsconfig.json`

Adopt the monorepo's strictness inline (rather than `extends`-ing the whole base) so Expo's RN-specific `module`/`moduleResolution`/`jsx`/`types` settings are not clobbered.

- [ ] **Step 1: Add the must-have strict flags**

Edit `apps/native/tsconfig.json` to add the bug-catching flags to `compilerOptions` (keep `extends: "expo/tsconfig.base"`, `strict: true`, and `paths`):

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

- [ ] **Step 2: Measure fallout**

Run: `pnpm --filter @dragons/native typecheck 2>&1 | tail -40`
Count the errors (`grep -c "error TS" <output>`). REPORT this count before mass-editing. The dominant rule will be `noUncheckedIndexedAccess` (`possibly undefined` on `arr[i]` / `obj[key]`).

- [ ] **Step 3: Fix the type errors**

Fix each, smallest files first. Typical fixes for `noUncheckedIndexedAccess`:
- `const first = list[0];` used unguarded → `const first = list[0]; if (!first) return ...;` or use `list.at(0)` with a guard.
- Destructured array access that's truly safe → narrow with an explicit check or a non-null assertion ONLY where provably safe, with a short comment.

The native tests from Workstream A are the regression net — run `pnpm --filter @dragons/native test` after fixing each cluster of files to confirm no behavior changed.

- [ ] **Step 4: Verify typecheck clean**

Run: `pnpm --filter @dragons/native typecheck 2>&1 | tail -10`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/native/tsconfig.json apps/native/src
git commit -m "build(native): adopt noUncheckedIndexedAccess + switch/casing strictness"
```

### Task B2: Attempt `verbatimModuleSyntax`; stage if noisy

**Files:**
- Modify: `apps/native/tsconfig.json`

- [ ] **Step 1: Turn it on and measure**

Add `"verbatimModuleSyntax": true` to `apps/native/tsconfig.json` compilerOptions. Run: `pnpm --filter @dragons/native typecheck 2>&1 | tail -40` and count errors.

- [ ] **Step 2: Decide based on fallout**

- If the fallout is a bounded set of "import should be `import type`" errors (the `consistent-type-imports` eslint rule from Workstream C likely already fixed most): fix them and keep the flag on.
- If it triggers Expo/Metro module-interop errors that are not mechanical type-only-import fixes: REMOVE the flag, and record in the workstream summary that `verbatimModuleSyntax` is deferred for native (with the specific blocker), so native matches the base on everything except this one option.

- [ ] **Step 3: Verify and commit**

Run: `pnpm --filter @dragons/native typecheck && pnpm --filter @dragons/native test 2>&1 | tail -10`
Expected: typecheck clean, tests PASS.

```bash
git add apps/native/tsconfig.json apps/native/src
git commit -m "build(native): enable verbatimModuleSyntax" # or: "docs(native): defer verbatimModuleSyntax (see plan)"
```

---

## Final: whole-repo green + docs

### Task F1: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document the new floor**

In `CLAUDE.md`, under Testing/Code Conventions, add/adjust:
- Note that `lint` (eslint, bug-class rules as errors) and `typecheck` (`tsc --noEmit`) are now distinct tasks run separately.
- Note coverage is gated per testable package (api, web, shared, api-client, contracts, native) at measured floors that ratchet up — not the api-only 90/95 that the doc previously implied as universal.
- Add the native test command: `pnpm --filter @dragons/native test`.

- [ ] **Step 2: Slop check + commit**

Run: `pnpm check:ai-slop`
Expected: passed.

```bash
git add CLAUDE.md
git commit -m "docs: record Phase 2 lint/coverage/native-test floor"
```

### Task F2: Full green gate

- [ ] **Step 1: Run every gate**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm coverage && pnpm build && pnpm check:ai-slop && node scripts/check-coverage-scripts.mjs`
Expected: all pass.

- [ ] **Step 2: Push the branch and open a PR**

```bash
git push -u origin feat/phase2-raise-the-floor
gh pr create --fill --base main
```

---

## Self-review notes

- **Spec coverage:** D1–D4 cover coverage gates + CI guard (spec §D). A1–A5 cover the native harness + the audit's named targets: today providers, registry, push registration, api 401 dedup (spec §A). C1–C4 cover the shared eslint config, per-package rollout, web rebase (spec §C). B1–B2 cover native tsconfig strictness with the measure-first escape hatch (spec §B). F1–F2 cover CI/docs + whole-repo green (spec "CI + docs").
- **Measure-first:** B1, B2, and C2/C3 all report fallout before mass-editing and carry an explicit narrow-scope fallback, matching the spec's two escape hatches.
- **Sequencing:** D → A → C → B as specified; native tests (A) precede native tsconfig strictness (B) so they act as the regression net.
