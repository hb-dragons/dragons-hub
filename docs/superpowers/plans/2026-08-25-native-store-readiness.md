# Native Store Readiness (code track) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the native app submittable on the engineering side — green `expo-doctor`, the two missing `app.json` declarations, in-app legal/support/deletion entry points, the AI disclosure, a push pre-permission sheet, and the hosted `apple-app-site-association`.

**Architecture:** Every decision lives in a small `lib/` module with a vitest test; screens only wire those modules to the UI (there is no render harness, and the coverage gate has ~0.1 pt of headroom). New routes are declared in three places (`src/app/`, `app/_layout.tsx`, `lib/nav/href.ts`) and the structural tests in `lib/nav/` keep them in sync. Docs (`PRE-LAUNCH.md`, `RELEASES.md`) move in the same commit as the code they describe.

**Tech Stack:** Expo SDK 57 / expo-router (native stack, form sheets), React Native, i18n-js (`%{var}` interpolation), AsyncStorage via `lib/local-storage.ts`, vitest 4 (node environment, per-test `vi.mock` of RN/Expo modules), Next.js 16 (`apps/web`), Astro (`apps/site`).

**Spec:** `docs/superpowers/specs/2026-08-25-native-store-readiness-design.md`

## Global Constraints

- Coverage floors in `apps/native/vitest.config.ts` are 17 / 11 / 21 / 16 (statements / branches / functions / lines are reported in the order `Stmts | Branch | Funcs | Lines`); every task ends with `pnpm --filter @dragons/native coverage` passing. Never lower a floor.
- Legal link targets: `https://hbdragons.de/datenschutz`, `https://hbdragons.de/impressum`; mailboxes `app@hbdragons.de` (support) and `datenschutz@hbdragons.de` (deletion requests).
- Apple team `2ZDTV3KLV2`, bundle id `de.hbdragons.app` (both already in `apps/native/app.json`).
- Every user-facing string exists in both `apps/native/src/i18n/de.json` and `en.json`; `src/i18n/locales.test.ts` fails on a missing key. i18n-js interpolation is `%{name}`.
- Prefs use `localStorage` from `@/lib/local-storage` (get/set only, no remove) with `snake_case` keys.
- `import type` for type-only imports (`consistent-type-imports` is an error); no floating promises (`void` them); no `any`.
- Prose in `.md` files passes `pnpm check:ai-slop` (banned words listed in `CLAUDE.md`).
- Commit messages: Conventional Commits, no AI trailers, reference the issue number.
- Working directory for every command below: the worktree root `/Users/jn/git/dragons-all/.claude/worktrees/native-store-readiness` unless the step says `cd apps/native`.

---

### Task 1: `expo-doctor` back to 20/20 (#231)

**Files:**
- Modify: `apps/native/package.json` (dependency versions, via `expo install`)
- Modify: `pnpm-workspace.yaml` (`overrides.expo-constants`)
- Modify: `pnpm-lock.yaml`
- Modify: `apps/native/RELEASES.md` ("`expo doctor` gates the build" section)

**Interfaces:**
- Consumes: nothing
- Produces: a lockfile every later task builds on

- [ ] **Step 1: Confirm the failing baseline**

Run: `pnpm --filter @dragons/native check:doctor 2>&1 | tail -n 6`
Expected: "8 packages out of date." and "1 check failed".

- [ ] **Step 2: Move the packages onto the SDK pins**

Run:
```bash
cd apps/native && npx expo install --fix
```
Expo CLI detects pnpm from the root lockfile and runs `pnpm add` for the eight packages (`expo`, `expo-router`, `expo-updates`, `expo-notifications`, `expo-constants`, `expo-image`, `expo-linking`, `expo-splash-screen`). If the command reports it cannot write because of the workspace, fall back to an explicit install with the versions `npx expo install --check` prints:
```bash
cd apps/native && pnpm add expo@<v> expo-router@<v> expo-updates@<v> expo-notifications@<v> expo-constants@<v> expo-image@<v> expo-linking@<v> expo-splash-screen@<v>
```

- [ ] **Step 3: Bump the workspace override for expo-constants**

`pnpm-workspace.yaml` pins `expo-constants: 57.0.10` so that only one copy resolves. Read the new version and update the override to that exact version (strip the `~`):
```bash
NEW=$(node -e 'console.log(require("./apps/native/package.json").dependencies["expo-constants"].replace(/^[~^]/, ""))'); echo $NEW
sed -i '' "s/^  expo-constants: .*/  expo-constants: $NEW/" pnpm-workspace.yaml
grep -n "expo-constants:" pnpm-workspace.yaml
pnpm install
```
Also check whether `expo install` bumped `react-native` or `expo-glass-effect` (`git diff apps/native/package.json`); if it did, update those override lines the same way.

- [ ] **Step 4: Verify doctor and the full native gate**

Run:
```bash
pnpm --filter @dragons/native check:doctor 2>&1 | tail -n 3
pnpm --filter @dragons/native typecheck && pnpm --filter @dragons/native lint && pnpm --filter @dragons/native coverage 2>&1 | grep -E "Test Files|All files|ERROR"
```
Expected: "20/20 checks passed. No issues detected!"; typecheck clean; lint 0 errors; 60 files pass; coverage line at or above 17.17 / 11.14 / 21.24 / 16.7.

- [ ] **Step 5: Correct RELEASES.md**

In `apps/native/RELEASES.md`, section "`expo doctor` gates the build", replace the paragraph that begins `As of #213 all 20 passed, with nothing skipped. On 2026-08-25 it is` with:
```markdown
As of #213 all 20 pass, with nothing skipped. The check "Packages match
versions required by installed Expo SDK" slipped to 19/20 once in August
2026, when eight `expo-*` packages fell behind the SDK 57 pins; #231 moved
them back with `npx expo install --fix`. When that happens again, remember
that `pnpm-workspace.yaml` pins `expo-constants` in its `overrides` block —
bump it to the same version, or the duplicate-native-modules check fails
next. Three checks needed structural fixes to reach 20 in the first place:
```
Also in "Current state (as of 2026-08-25)", delete the two lines `Eight \`expo-*\` packages sit behind the SDK 57 pins, so \`check:doctor\` is at 19/20 — see "\`expo doctor\` gates the build" below.` and update the `expo` / `expo-router` version in the first bullet to the installed one.

- [ ] **Step 6: Commit**

```bash
pnpm check:ai-slop
git add apps/native/package.json pnpm-workspace.yaml pnpm-lock.yaml apps/native/RELEASES.md
git commit -m "build(native): move the expo packages onto the SDK 57 pins (#231)

expo-doctor reported 8 packages behind the pins, which fails every EAS
build and CI's native-doctor job. The expo-constants override in
pnpm-workspace.yaml follows the new version so only one copy resolves."
```

---

### Task 2: `ios.privacyManifests` and `locales` (#232)

**Files:**
- Modify: `apps/native/app.json`
- Create: `apps/native/locales/de.json`, `apps/native/locales/en.json`
- Test: `apps/native/src/lib/app-config.test.ts`
- Modify: `apps/native/PRE-LAUNCH.md` (§ Privacy / compliance)

**Interfaces:**
- Consumes: nothing
- Produces: nothing code-facing

- [ ] **Step 1: Write the failing tests**

Append to `apps/native/src/lib/app-config.test.ts`. First widen the parsed type at the top of the file — replace the existing `as { expo: { ... } }` cast with:
```ts
const { expo } = JSON.parse(readFileSync(APP_JSON, "utf8")) as {
  expo: {
    ios?: {
      deploymentTarget?: string;
      associatedDomains?: string[];
      infoPlist?: Record<string, unknown>;
      privacyManifests?: {
        NSPrivacyTracking?: boolean;
        NSPrivacyAccessedAPITypes?: {
          NSPrivacyAccessedAPIType: string;
          NSPrivacyAccessedAPITypeReasons: string[];
        }[];
      };
    };
    android?: {
      intentFilters?: {
        autoVerify?: boolean;
        data?: { scheme?: string; host?: string }[];
      }[];
    };
    locales?: Record<string, string>;
  };
};
```
Then append:
```ts
/**
 * Apple's required-reason APIs (App Store review since May 2024). The prebuild
 * template writes no app-level manifest, and Apple mis-parses manifests inside
 * static pods, so the app declares the union of what its dependencies use:
 * react-native, expo-constants/-localization/-notifications/-device and
 * async-storage — verified in node_modules on 2026-08-25. Re-check the union
 * after adding a native dependency, and read the ITMS-91053 mail after every
 * first upload of a new build.
 */
const REQUIRED_REASON_APIS: [type: string, reason: string][] = [
  ["NSPrivacyAccessedAPICategoryUserDefaults", "CA92.1"],
  ["NSPrivacyAccessedAPICategoryFileTimestamp", "C617.1"],
  ["NSPrivacyAccessedAPICategorySystemBootTime", "35F9.1"],
];

describe("app.json privacy manifest", () => {
  const manifest = expo.ios?.privacyManifests;

  it("declares that the app does not track", () => {
    expect(manifest?.NSPrivacyTracking).toBe(false);
  });

  it.each(REQUIRED_REASON_APIS)("declares %s with reason %s", (type, reason) => {
    const entry = manifest?.NSPrivacyAccessedAPITypes?.find(
      (candidate) => candidate.NSPrivacyAccessedAPIType === type,
    );
    expect(entry?.NSPrivacyAccessedAPITypeReasons).toEqual([reason]);
  });
});

/**
 * The runtime is de + en (`src/lib/i18n.ts`), but a binary that declares only
 * its development region is English-only to iOS Settings, the store's
 * "Languages" row and the Face ID prompt. `locales` writes one
 * `InfoPlist.strings` per language at prebuild.
 */
const APP_LANGUAGES = ["de", "en"];

describe("app.json locales", () => {
  it("declares the runtime's two languages", () => {
    expect(Object.keys(expo.locales ?? {}).sort()).toEqual(APP_LANGUAGES);
  });

  it.each(APP_LANGUAGES)("%s translates the Face ID prompt", (lang) => {
    const file = path.resolve(path.dirname(APP_JSON), expo.locales?.[lang] ?? "");
    const strings = JSON.parse(readFileSync(file, "utf8")) as Record<string, string>;
    expect(strings.NSFaceIDUsageDescription).toMatch(/\S/);
  });

  it("allows mixed localizations so iOS picks the translated strings", () => {
    expect(expo.ios?.infoPlist?.CFBundleAllowMixedLocalizations).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @dragons/native test -- src/lib/app-config.test.ts 2>&1 | tail -n 15`
Expected: 7 new failures (tracking, three API types, two languages, mixed localizations); the four existing tests still pass.

- [ ] **Step 3: Add the config**

Create `apps/native/locales/de.json`:
```json
{
  "NSFaceIDUsageDescription": "Mit Face ID die Dragons-App entsperren"
}
```
Create `apps/native/locales/en.json`:
```json
{
  "NSFaceIDUsageDescription": "Use Face ID to unlock the Dragons app"
}
```
In `apps/native/app.json`, inside `"ios"`, change `"infoPlist"` to:
```json
"infoPlist": {
  "NSFaceIDUsageDescription": "Use Face ID to unlock the Dragons app",
  "ITSAppUsesNonExemptEncryption": false,
  "CFBundleAllowMixedLocalizations": true
},
"privacyManifests": {
  "NSPrivacyTracking": false,
  "NSPrivacyAccessedAPITypes": [
    {
      "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryUserDefaults",
      "NSPrivacyAccessedAPITypeReasons": ["CA92.1"]
    },
    {
      "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryFileTimestamp",
      "NSPrivacyAccessedAPITypeReasons": ["C617.1"]
    },
    {
      "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategorySystemBootTime",
      "NSPrivacyAccessedAPITypeReasons": ["35F9.1"]
    }
  ]
},
```
and add, as a sibling of `"ios"` (top level under `"expo"`):
```json
"locales": {
  "de": "./locales/de.json",
  "en": "./locales/en.json"
},
```

- [ ] **Step 4: Run the tests to verify they pass, then prebuild-validate the config**

Run: `pnpm --filter @dragons/native test -- src/lib/app-config.test.ts 2>&1 | tail -n 5`
Expected: all 11 tests pass.
Run: `cd apps/native && npx expo config --type introspect 2>&1 | grep -E "privacyManifests|CFBundleAllowMixedLocalizations|locales" | head`
Expected: the three keys appear in the resolved config (this proves the schema accepted them; a typo would print a validation warning instead).

- [ ] **Step 5: Correct PRE-LAUNCH.md**

In `apps/native/PRE-LAUNCH.md` § "Privacy / compliance", replace the first item (`- [ ] Add the app-level \`ios.privacyManifests\` key …` through `Audit §1.1 and §2.2.`) with:
```markdown
- [x] ~~Add the app-level `ios.privacyManifests` key to `app.json`.~~ Done
      (#232): the manifest declares UserDefaults `CA92.1`, FileTimestamp
      `C617.1` and SystemBootTime `35F9.1` with `NSPrivacyTracking: false`,
      and `lib/app-config.test.ts` pins all four. Still open: read the
      ITMS-91053 mail after the first upload of a new build and add any
      API Apple flags; keep the App Store Connect privacy label in step
      (audit §2.2).
- [x] `locales` declares de + en with a translated Face ID prompt and
      `CFBundleAllowMixedLocalizations` is on (#232), so the binary is no
      longer English-only to iOS Settings and the store.
```

- [ ] **Step 6: Full native gate and commit**

Run: `pnpm --filter @dragons/native typecheck && pnpm --filter @dragons/native lint && pnpm --filter @dragons/native coverage 2>&1 | grep -E "Test Files|All files|ERROR" && pnpm check:ai-slop`
Expected: clean; coverage floors hold (this task adds only test code).
```bash
git add apps/native/app.json apps/native/locales apps/native/src/lib/app-config.test.ts apps/native/PRE-LAUNCH.md
git commit -m "feat(native): declare the iOS privacy manifest and de/en locales (#232)

Apple requires an app-level PrivacyInfo.xcprivacy naming the
required-reason APIs the dependencies use; the prebuild template ships
none. locales + CFBundleAllowMixedLocalizations stop the binary from
presenting as English-only."
```

---

### Task 3: Legal link helpers (#233, pure module)

**Files:**
- Create: `apps/native/src/lib/legal/links.ts`
- Test: `apps/native/src/lib/legal/links.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `LEGAL_LINKS: { readonly privacy: string; readonly imprint: string }`
  - `SUPPORT_MAILBOX: string`, `PRIVACY_MAILBOX: string`
  - `interface AppVersionInfo { version: string | null; build: string | null }`
  - `appVersionLabel(info: AppVersionInfo): string`
  - `buildMailto(input: { to: string; subject: string; body?: string }): string`
  - `buildSupportMailto(input: AppVersionInfo & { platform: string }): string`

- [ ] **Step 1: Write the failing tests**

Create `apps/native/src/lib/legal/links.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  LEGAL_LINKS,
  PRIVACY_MAILBOX,
  SUPPORT_MAILBOX,
  appVersionLabel,
  buildMailto,
  buildSupportMailto,
} from "@/lib/legal/links";

describe("LEGAL_LINKS", () => {
  it("point at the club site over https", () => {
    expect(LEGAL_LINKS.privacy).toBe("https://hbdragons.de/datenschutz");
    expect(LEGAL_LINKS.imprint).toBe("https://hbdragons.de/impressum");
  });

  it("names role mailboxes, never a person", () => {
    expect(SUPPORT_MAILBOX).toBe("app@hbdragons.de");
    expect(PRIVACY_MAILBOX).toBe("datenschutz@hbdragons.de");
  });
});

describe("appVersionLabel", () => {
  it("joins version and build", () => {
    expect(appVersionLabel({ version: "1.0.0", build: "5" })).toBe("1.0.0 (5)");
  });

  it("drops the build when the platform does not report one", () => {
    expect(appVersionLabel({ version: "1.0.0", build: null })).toBe("1.0.0");
  });

  it("says dev when nothing native is available (tests, Expo Go)", () => {
    expect(appVersionLabel({ version: null, build: null })).toBe("dev");
  });
});

describe("buildMailto", () => {
  it("percent-encodes the subject and body", () => {
    const url = buildMailto({ to: "a@b.de", subject: "Grüße & Fragen", body: "Zeile 1\nZeile 2" });
    expect(url).toBe("mailto:a@b.de?subject=Gr%C3%BC%C3%9Fe%20%26%20Fragen&body=Zeile%201%0AZeile%202");
  });

  it("omits the body parameter when there is no body", () => {
    expect(buildMailto({ to: "a@b.de", subject: "Hi" })).toBe("mailto:a@b.de?subject=Hi");
  });
});

describe("buildSupportMailto", () => {
  it("addresses the support mailbox with the version and platform in the subject", () => {
    const url = buildSupportMailto({ version: "1.0.0", build: "5", platform: "ios" });
    expect(url.startsWith(`mailto:${SUPPORT_MAILBOX}?subject=`)).toBe(true);
    expect(decodeURIComponent(url.split("subject=")[1]!)).toBe("Dragons App 1.0.0 (5) ios — Support");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @dragons/native test -- src/lib/legal/links.test.ts 2>&1 | tail -n 5`
Expected: FAIL — cannot resolve `@/lib/legal/links`.

- [ ] **Step 3: Implement the module**

Create `apps/native/src/lib/legal/links.ts`:
```ts
/**
 * Where the app sends people for the legal texts and for support.
 *
 * Apple 5.1.1(i), § 5 DDG and § 18 MStV each require the Impressum and the
 * Datenschutzerklärung to be reachable from inside the app; linking to the
 * club site satisfies them (two-click rule, BGH I ZR 228/03). The mailboxes are
 * role addresses on purpose: a member's private address would be published on
 * the store page and break when they leave the club.
 */
export const LEGAL_LINKS = {
  privacy: "https://hbdragons.de/datenschutz",
  imprint: "https://hbdragons.de/impressum",
} as const;

export const SUPPORT_MAILBOX = "app@hbdragons.de";
export const PRIVACY_MAILBOX = "datenschutz@hbdragons.de";

export interface AppVersionInfo {
  version: string | null;
  build: string | null;
}

/** `1.0.0 (5)`; `1.0.0` without a build; `dev` where nothing native reports. */
export function appVersionLabel({ version, build }: AppVersionInfo): string {
  if (!version) return "dev";
  return build ? `${version} (${build})` : version;
}

export function buildMailto({
  to,
  subject,
  body,
}: {
  to: string;
  subject: string;
  body?: string;
}): string {
  const params = [`subject=${encodeURIComponent(subject)}`];
  if (body) params.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${to}?${params.join("&")}`;
}

export function buildSupportMailto(info: AppVersionInfo & { platform: string }): string {
  return buildMailto({
    to: SUPPORT_MAILBOX,
    subject: `Dragons App ${appVersionLabel(info)} ${info.platform} — Support`,
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @dragons/native test -- src/lib/legal/links.test.ts 2>&1 | tail -n 5`
Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/native/src/lib/legal
git commit -m "feat(native): legal link and mailto helpers (#233)"
```

---

### Task 4: Rechtliches section on Profile and the sign-in footer (#233)

**Files:**
- Modify: `apps/native/package.json` (add `expo-application`)
- Create: `apps/native/src/lib/legal/app-version.ts`
- Test: `apps/native/src/lib/legal/app-version.test.ts`
- Create: `apps/native/src/components/LegalSection.tsx`
- Modify: `apps/native/src/app/profile.tsx` (both branches)
- Modify: `apps/native/src/app/(auth)/sign-in.tsx` (footer)
- Modify: `apps/native/src/i18n/de.json`, `apps/native/src/i18n/en.json` (new `legal` group)
- Test: `apps/native/src/lib/nav/architecture.test.ts` (one new assertion)
- Modify: `apps/native/PRE-LAUNCH.md`

**Interfaces:**
- Consumes: Task 3's `LEGAL_LINKS`, `appVersionLabel`, `buildSupportMailto`, `AppVersionInfo`
- Produces:
  - `readAppVersion(): AppVersionInfo` (`lib/legal/app-version.ts`)
  - `LegalSection({ children?: ReactNode })` component and `LegalRow({ label, onPress, destructive? })` (exported from `components/LegalSection.tsx`) — Task 5 appends a row through `children`
  - `openExternal(url: string): void` exported from `components/LegalSection.tsx`

- [ ] **Step 1: Install expo-application**

Run: `cd apps/native && npx expo install expo-application && cd ../.. && pnpm --filter @dragons/native check:doctor 2>&1 | tail -n 2`
Expected: `expo-application` at `~57.x` in `dependencies`; doctor still 20/20.

- [ ] **Step 2: Write the failing app-version test**

Create `apps/native/src/lib/legal/app-version.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("expo-application", () => ({
  nativeApplicationVersion: "1.0.0",
  nativeBuildVersion: "5",
}));

import { readAppVersion } from "@/lib/legal/app-version";

describe("readAppVersion", () => {
  it("reads the marketing version and the build number from the binary", () => {
    expect(readAppVersion()).toEqual({ version: "1.0.0", build: "5" });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @dragons/native test -- src/lib/legal/app-version.test.ts 2>&1 | tail -n 5`
Expected: FAIL — cannot resolve `@/lib/legal/app-version`.

- [ ] **Step 4: Implement app-version.ts**

Create `apps/native/src/lib/legal/app-version.ts`:
```ts
import * as Application from "expo-application";
import type { AppVersionInfo } from "./links";

/**
 * What the installed binary reports about itself. Kept apart from `links.ts`
 * so the mailto/label helpers stay free of native modules in tests. Under EAS
 * the build number comes from the remote counter, so `app.json` cannot know
 * it — only the binary can.
 */
export function readAppVersion(): AppVersionInfo {
  return {
    version: Application.nativeApplicationVersion,
    build: Application.nativeBuildVersion,
  };
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm --filter @dragons/native test -- src/lib/legal/app-version.test.ts 2>&1 | tail -n 5`
Expected: 1 test passes.

- [ ] **Step 6: Add the strings**

In `apps/native/src/i18n/de.json`, add a top-level group (after `"profile"`):
```json
"legal": {
  "title": "Rechtliches",
  "privacy": "Datenschutz",
  "imprint": "Impressum",
  "support": "Support kontaktieren",
  "version": "Version %{version}",
  "openFailed": "Der Link konnte nicht geöffnet werden."
},
```
In `apps/native/src/i18n/en.json`:
```json
"legal": {
  "title": "Legal",
  "privacy": "Privacy policy",
  "imprint": "Imprint",
  "support": "Contact support",
  "version": "Version %{version}",
  "openFailed": "The link could not be opened."
},
```

- [ ] **Step 7: Write the failing structural assertion**

In `apps/native/src/lib/nav/architecture.test.ts`, inside `describe("navigation architecture", …)` after the `"reaches the sheet-result table…"` test, add:
```ts
  // Apple 5.1.1(i), § 5 DDG, § 18 MStV (#233): the Impressum, the
  // Datenschutzerklärung and a support contact must be reachable signed out.
  // Without a render harness the guarantee is structural: the two screens a
  // Fan meets first — Profile (one tap from Home) and the sign-in form — are
  // the only importers of the legal section and its link table.
  it("reaches the legal links from Profile and the sign-in screen", () => {
    expect(importSites("@/components/LegalSection")).toEqual(["src/app/profile.tsx"]);
    const linkSites = SOURCE_FILES.filter((file) =>
      importsOf(file).some((spec) => /(^|\/)legal\/links$/.test(spec)),
    ).map(rel);
    expect(linkSites).toContain("src/app/(auth)/sign-in.tsx");
    expect(linkSites).toContain("src/components/LegalSection.tsx");
  });
```

- [ ] **Step 8: Run it to verify it fails**

Run: `pnpm --filter @dragons/native test -- src/lib/nav/architecture.test.ts 2>&1 | grep -E "legal|Tests" | head`
Expected: the new test fails (no importers yet).

- [ ] **Step 9: Create the component**

Create `apps/native/src/components/LegalSection.tsx`:
```tsx
import type { ReactNode } from "react";
import { Alert, Linking, Platform, Pressable, Text, View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { SectionHeader } from "@/components/SectionHeader";
import { LEGAL_LINKS, appVersionLabel, buildSupportMailto } from "@/lib/legal/links";
import { readAppVersion } from "@/lib/legal/app-version";

/**
 * Opens a web or mailto URL in the system handler. A device without a mail
 * client rejects the mailto; the alert says so instead of failing silently.
 */
export function openExternal(url: string): void {
  Linking.openURL(url).catch(() => {
    Alert.alert(i18n.t("legal.openFailed"));
  });
}

export function LegalRow({
  label,
  onPress,
  destructive = false,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const { colors, textStyles, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [
        { paddingVertical: spacing.md, minHeight: 44, justifyContent: "center" },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Text style={[textStyles.body, { color: destructive ? colors.destructive : colors.foreground }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The "Rechtliches" group: Datenschutz, Impressum, support mail and the
 * installed version. Rendered on Profile signed out and signed in; the
 * signed-in branch appends its account rows through `children` so the whole
 * group stays one list (#233, #234).
 */
export function LegalSection({ children }: { children?: ReactNode }) {
  const { colors, textStyles, spacing } = useTheme();
  const version = readAppVersion();

  return (
    <View>
      <SectionHeader title={i18n.t("legal.title")} />
      <LegalRow label={i18n.t("legal.privacy")} onPress={() => openExternal(LEGAL_LINKS.privacy)} />
      <LegalRow label={i18n.t("legal.imprint")} onPress={() => openExternal(LEGAL_LINKS.imprint)} />
      <LegalRow
        label={i18n.t("legal.support")}
        onPress={() => openExternal(buildSupportMailto({ ...version, platform: Platform.OS }))}
      />
      {children}
      <Text style={[textStyles.caption, { color: colors.mutedForeground, paddingVertical: spacing.sm }]}>
        {i18n.t("legal.version", { version: appVersionLabel(version) })}
      </Text>
    </View>
  );
}
```

- [ ] **Step 10: Wire Profile (both branches)**

In `apps/native/src/app/profile.tsx`:
- Add `import { LegalSection } from "@/components/LegalSection";` after the `Logo` import.
- Signed-out branch: after the closing `</View>` of the language block (the `<View style={{ marginTop: spacing.xl * 2 }}>` … `</View>`), add:
```tsx
        <View style={{ marginTop: spacing.xl }}>
          <LegalSection />
        </View>
```
- Signed-in branch: between the `{/* Language section */}` block and the `{/* Sign Out */}` Pressable, add:
```tsx
        {/* Rechtliches (#233) */}
        <LegalSection />
```

- [ ] **Step 11: Wire the sign-in footer**

In `apps/native/src/app/(auth)/sign-in.tsx`:
- Add `Linking,` to the `react-native` import list.
- Add `import { LEGAL_LINKS } from "@/lib/legal/links";` after the `Icon` import.
- After the `<Text …>{i18n.t("auth.noAccountHint")}</Text>` element (still inside the content `View`), add:
```tsx
        {/* Legal links reachable before sign-in (#233). */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            gap: spacing.md,
            marginTop: spacing.lg,
          }}
        >
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(LEGAL_LINKS.privacy)}>
            <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
              {i18n.t("legal.privacy")}
            </Text>
          </Pressable>
          <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>·</Text>
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(LEGAL_LINKS.imprint)}>
            <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
              {i18n.t("legal.imprint")}
            </Text>
          </Pressable>
        </View>
```

- [ ] **Step 12: Run the structural and locale tests**

Run: `pnpm --filter @dragons/native test -- src/lib/nav/architecture.test.ts src/i18n/locales.test.ts 2>&1 | grep -E "Tests|FAIL|✗|×" | head`
Expected: all pass.

- [ ] **Step 13: Update PRE-LAUNCH.md**

In `apps/native/PRE-LAUNCH.md` § "Privacy / compliance", change the last item (`- [ ] What the store forms and DE/EU law ask for beyond this file …`) to begin `- [ ] What the store forms and DE/EU law ask for beyond this file — ~~the in-app Impressum / Datenschutz / support entry~~ (done, #233: \`components/LegalSection.tsx\` on Profile signed in and out, plus the sign-in footer; \`lib/nav/architecture.test.ts\` pins both), an account-deletion request, …` (keep the rest of the sentence unchanged).

- [ ] **Step 14: Full native gate and commit**

Run: `pnpm --filter @dragons/native typecheck && pnpm --filter @dragons/native lint && pnpm --filter @dragons/native coverage 2>&1 | grep -E "Test Files|All files|ERROR" && pnpm --filter @dragons/native check:doctor 2>&1 | tail -n 1 && pnpm check:ai-slop`
Expected: clean; coverage at or above the floors. If statements dip below 17.00: move the four row definitions into `lib/legal/links.ts` as a tested `legalRows(version: AppVersionInfo, platform: string): { key: string; url: string }[]` table and map over it in `LegalSection`, so the URL construction is covered and the component is one `map`.
```bash
git add apps/native/package.json pnpm-lock.yaml apps/native/src/lib/legal apps/native/src/components/LegalSection.tsx apps/native/src/app/profile.tsx "apps/native/src/app/(auth)/sign-in.tsx" apps/native/src/i18n apps/native/src/lib/nav/architecture.test.ts apps/native/PRE-LAUNCH.md
git commit -m "feat(native): Rechtliches and support entry reachable signed out (#233)

Datenschutz, Impressum, a support mailto and the installed version on
Profile in both branches, plus a footer on the sign-in screen, so a Fan
reaches every legal link in two taps. The architecture test pins the
two import sites."
```

---

### Task 5: Account-deletion request (#234)

**Files:**
- Modify: `apps/native/src/lib/legal/links.ts` (`buildDeletionMailto`)
- Test: `apps/native/src/lib/legal/links.test.ts`
- Modify: `apps/native/src/app/profile.tsx` (signed-in row)
- Modify: `apps/native/src/i18n/de.json`, `en.json` (`legal.deleteAccount`)
- Create: `apps/site/src/pages/konto-loeschen/index.astro`
- Modify: `apps/site/src/lib/strings.ts` (`kontoLoeschen`, `seo.kontoLoeschen`)
- Create: `apps/native/STORE-LISTING.md`
- Modify: `apps/native/PRE-LAUNCH.md`

**Interfaces:**
- Consumes: Task 3/4 — `buildMailto`, `PRIVACY_MAILBOX`, `appVersionLabel`, `readAppVersion`, `LegalSection`, `LegalRow`, `openExternal`
- Produces: `buildDeletionMailto(input: { email: string; version: string }): string`

- [ ] **Step 1: Write the failing test**

Append to `apps/native/src/lib/legal/links.test.ts` (extend the import list with `buildDeletionMailto`):
```ts
describe("buildDeletionMailto", () => {
  it("addresses the Datenschutz mailbox, names the account, and states the 30-day window", () => {
    const url = buildDeletionMailto({ email: "max@example.de", version: "1.0.0 (5)" });
    expect(url.startsWith(`mailto:${PRIVACY_MAILBOX}?subject=`)).toBe(true);
    const query = new URLSearchParams(url.slice(url.indexOf("?") + 1));
    expect(query.get("subject")).toBe("Dragons App: Konto löschen — max@example.de");
    expect(query.get("body")).toContain("max@example.de");
    expect(query.get("body")).toContain("1.0.0 (5)");
    expect(query.get("body")).toContain("30 Tagen");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @dragons/native test -- src/lib/legal/links.test.ts 2>&1 | tail -n 5`
Expected: FAIL — `buildDeletionMailto` is not exported.

- [ ] **Step 3: Implement**

Append to `apps/native/src/lib/legal/links.ts`:
```ts
/**
 * Accounts are club-provisioned, so deletion is a request to the club, not a
 * self-service action (audit §1.2 item 4). The mail is German regardless of
 * the UI locale: it is read by the Datenschutz mailbox, and the row label the
 * user sees is localized separately.
 */
export function buildDeletionMailto({ email, version }: { email: string; version: string }): string {
  return buildMailto({
    to: PRIVACY_MAILBOX,
    subject: `Dragons App: Konto löschen — ${email}`,
    body: [
      `Bitte löscht mein Konto in der Dragons App (${email}).`,
      "",
      `App-Version: ${version}`,
      "",
      "Mir ist bekannt, dass das Konto und die dazugehörigen Geräte-Tokens innerhalb von 30 Tagen gelöscht werden.",
    ].join("\n"),
  });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @dragons/native test -- src/lib/legal/links.test.ts 2>&1 | tail -n 5`
Expected: 9 tests pass.

- [ ] **Step 5: Strings and the Profile row**

Add to the `legal` group in `de.json`: `"deleteAccount": "Konto löschen beantragen"`; in `en.json`: `"deleteAccount": "Request account deletion"`.

In `apps/native/src/app/profile.tsx`:
- Change the `LegalSection` import to `import { LegalRow, LegalSection, openExternal } from "@/components/LegalSection";`
- Add `import { appVersionLabel, buildDeletionMailto } from "@/lib/legal/links";` and `import { readAppVersion } from "@/lib/legal/app-version";`
- Replace the signed-in `<LegalSection />` with:
```tsx
        {/* Rechtliches (#233) + deletion request (#234) */}
        <LegalSection>
          <LegalRow
            destructive
            label={i18n.t("legal.deleteAccount")}
            onPress={() =>
              openExternal(
                buildDeletionMailto({
                  email: session.user.email,
                  version: appVersionLabel(readAppVersion()),
                }),
              )
            }
          />
        </LegalSection>
```

- [ ] **Step 6: Site page**

In `apps/site/src/lib/strings.ts`, after the `datenschutz: { heading: … },` entry add:
```ts
  kontoLoeschen: {
    heading: "Konto löschen",
  },
```
and in the `seo` block after `datenschutz:` add:
```ts
    kontoLoeschen:
      "So beantragen Mitglieder die Löschung ihres Kontos in der Dragons App: per Mail an die Datenschutz-Adresse oder direkt aus der App.",
```
Create `apps/site/src/pages/konto-loeschen/index.astro`:
```astro
---
// Account-deletion page for the Dragons App (issue #234). Both stores ask for
// a URL that explains how an account is deleted; accounts are created by club
// admins, so deletion is a request to the club.
import PageContainer from "../../components/PageContainer.astro";
import PageHeader from "../../components/PageHeader.astro";
import SafeMail from "../../components/SafeMail.astro";
import Layout from "../../layouts/Layout.astro";
import { strings } from "../../lib/strings";
---

<Layout title={strings.kontoLoeschen.heading} description={strings.seo.kontoLoeschen}>
  <PageHeader title={strings.kontoLoeschen.heading} />

  <PageContainer>
    <header class="mb-10">
      <h1 class="text-3xl font-bold tracking-tight">Konto in der Dragons App löschen</h1>
      <p class="mt-2 text-sm text-muted-foreground">Stand: 25. August 2026</p>
    </header>

    <section class="space-y-4">
      <p>
        Konten in der Dragons App werden vom Verein für Schiedsrichter, Trainerinnen und
        Trainer, Team-Manager und Vorstand angelegt. Fans brauchen kein Konto. Wer sein
        Konto nicht mehr braucht, beantragt die Löschung auf einem von zwei Wegen:
      </p>
      <ol class="list-decimal space-y-2 pl-6">
        <li>
          In der App: <strong>Profil → Rechtliches → Konto löschen beantragen</strong>. Die
          App öffnet eine vorbereitete E-Mail an uns.
        </li>
        <li>
          Per E-Mail an <SafeMail user="datenschutz" domain="hbdragons.de" /> mit der
          E-Mail-Adresse, mit der das Konto angemeldet ist.
        </li>
      </ol>
      <p>
        Wir löschen das Konto, die zugehörigen Rollen und die auf dem Vereinsserver
        gespeicherten Push-Tokens innerhalb von 30 Tagen und bestätigen die Löschung per
        E-Mail. Daten, die der Verein aus rechtlichen Gründen aufbewahren muss (zum
        Beispiel Schiedsrichter-Abrechnungen), bleiben davon unberührt; Näheres steht in
        der <a href="/datenschutz/" class="underline">Datenschutzerklärung</a>.
      </p>
    </section>
  </PageContainer>
</Layout>
```
Check the `SafeMail` component's props first: `grep -n "Props\|user\|domain\|address" apps/site/src/components/SafeMail.astro | head`. If it takes a single `address` prop, pass `address="datenschutz@hbdragons.de"` instead.

- [ ] **Step 7: Review notes file**

Create `apps/native/STORE-LISTING.md`:
```markdown
# Store listing and review notes

Everything App Store Connect and Google Play ask for in text form, kept in
the repo so the next submission does not start from memory. The copy and
screenshot sections are filled by #245; the review notes below ship with
the first submission (#250).

## Review notes (paste into "Notes" in App Store Connect / Play)

Accounts in this app are created by club administrators; there is no
sign-up and no in-app password reset. The demo accounts below cover every
role. Fans (signed out) see the public schedule, standings and teams.
Signed-in Staff additionally see the Officiating tab (referee
assignments), Today, the board tools and the "KI-Assistent", a members-only
Q&A over club data powered by Google Gemini (a first-use notice explains
this in-app). Face ID lock is optional and off by default. Account
deletion: Profile → Rechtliches → "Konto löschen beantragen" opens a
prefilled mail to datenschutz@hbdragons.de; the club deletes the account
within 30 days (https://hbdragons.de/konto-loeschen/). Universal links
are claimed for https://app.hbdragons.de. Push notifications are
operational only (schedule changes, referee assignments, task reminders)
and are explained before the system prompt.

Demo accounts (production API): filled in by #250 before submission.

## Listing copy

Filled by #245.
```

- [ ] **Step 8: PRE-LAUNCH note, site check, native gate, commit**

In `apps/native/PRE-LAUNCH.md` § "Privacy / compliance", in the last item change `an account-deletion request,` to `~~an account-deletion request~~ (done, #234: Profile row + hbdragons.de/konto-loeschen + review notes in \`STORE-LISTING.md\`),`.

Run: `pnpm --filter @dragons/site build 2>&1 | tail -n 3` — Expected: build succeeds and prints the `konto-loeschen` page. If `astro build` needs `CMS_URL`/`CMS_API_TOKEN` (see `apps/site/.env.example`) and fails on their absence, run `pnpm --filter @dragons/site astro check 2>&1 | tail -n 3` instead and note it in the commit body.
Run: `pnpm --filter @dragons/native typecheck && pnpm --filter @dragons/native lint && pnpm --filter @dragons/native coverage 2>&1 | grep -E "Test Files|All files|ERROR" && pnpm check:ai-slop`
Expected: clean; floors hold.
```bash
git add apps/native/src/lib/legal apps/native/src/app/profile.tsx apps/native/src/i18n apps/site/src/pages/konto-loeschen apps/site/src/lib/strings.ts apps/native/STORE-LISTING.md apps/native/PRE-LAUNCH.md
git commit -m "feat(native,site): account-deletion request for Staff (#234)

Accounts are club-provisioned, so deletion is a request: a Profile row
opens a prefilled mail to the Datenschutz mailbox, and the site gains
the page both store forms ask for. Review notes live in STORE-LISTING.md."
```

---

### Task 6: KI disclosure on the assistant (#235)

**Files:**
- Create: `apps/native/src/lib/assistant/ai-notice.ts`
- Test: `apps/native/src/lib/assistant/ai-notice.test.ts`
- Modify: `apps/native/src/lib/assistant/composer.ts` (`composerButtonState` gains `disabled`)
- Test: `apps/native/src/lib/assistant/composer.test.ts`
- Create: `apps/native/src/hooks/useAiNotice.ts`
- Create: `apps/native/src/components/assistant/AiNoticeCard.tsx`
- Modify: `apps/native/src/components/assistant/ChatComposer.tsx` (`disabled` prop)
- Modify: `apps/native/src/app/assistant.tsx`
- Modify: `apps/native/src/i18n/de.json`, `en.json`
- Create: `docs/adr/0005-ai-assistant-transparency.md`
- Modify: `apps/native/PRE-LAUNCH.md`

**Interfaces:**
- Consumes: `localStorage` from `@/lib/local-storage`
- Produces:
  - `AI_NOTICE_KEY = "assistant_ai_notice_ack"`
  - `type AiNoticeState = "pending" | "show" | "hidden"`
  - `resolveNoticeState({ loaded, acknowledged }): AiNoticeState`
  - `readAiNoticeAcknowledged(): Promise<boolean>`, `acknowledgeAiNotice(): Promise<void>`
  - `useAiNotice(): { state: AiNoticeState; acknowledge: () => void }`
  - `composerButtonState(busy: boolean, value: string, disabled?: boolean)`
  - `ChatComposer` prop `disabled?: boolean`

- [ ] **Step 1: Write the failing ai-notice tests**

Create `apps/native/src/lib/assistant/ai-notice.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const getItem = vi.fn();
const setItem = vi.fn();
vi.mock("@/lib/local-storage", () => ({
  localStorage: {
    getItem: (...a: unknown[]) => getItem(...a),
    setItem: (...a: unknown[]) => setItem(...a),
  },
}));

import {
  AI_NOTICE_KEY,
  acknowledgeAiNotice,
  readAiNoticeAcknowledged,
  resolveNoticeState,
} from "@/lib/assistant/ai-notice";

describe("resolveNoticeState", () => {
  it("is pending until storage has been read", () => {
    expect(resolveNoticeState({ loaded: false, acknowledged: false })).toBe("pending");
    expect(resolveNoticeState({ loaded: false, acknowledged: true })).toBe("pending");
  });

  it("shows the notice once loaded and not yet acknowledged", () => {
    expect(resolveNoticeState({ loaded: true, acknowledged: false })).toBe("show");
  });

  it("hides the notice once acknowledged", () => {
    expect(resolveNoticeState({ loaded: true, acknowledged: true })).toBe("hidden");
  });
});

describe("ai notice storage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the acknowledgement flag", async () => {
    getItem.mockResolvedValue("1");
    expect(await readAiNoticeAcknowledged()).toBe(true);
    expect(getItem).toHaveBeenCalledWith(AI_NOTICE_KEY);
  });

  it("treats anything but the flag as not acknowledged", async () => {
    getItem.mockResolvedValue(null);
    expect(await readAiNoticeAcknowledged()).toBe(false);
  });

  it("treats a storage failure as not acknowledged — one extra notice, never a missing one", async () => {
    getItem.mockRejectedValue(new Error("disk"));
    expect(await readAiNoticeAcknowledged()).toBe(false);
  });

  it("writes the flag on acknowledgement", async () => {
    setItem.mockResolvedValue(undefined);
    await acknowledgeAiNotice();
    expect(setItem).toHaveBeenCalledWith(AI_NOTICE_KEY, "1");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @dragons/native test -- src/lib/assistant/ai-notice.test.ts 2>&1 | tail -n 5`
Expected: FAIL — cannot resolve `@/lib/assistant/ai-notice`.

- [ ] **Step 3: Implement ai-notice.ts**

Create `apps/native/src/lib/assistant/ai-notice.ts`:
```ts
import { localStorage } from "@/lib/local-storage";

/**
 * AI Act Art. 50(1) (in force since 2026-08-02) and Apple 5.1.2(i): before the
 * first interaction the user is told that the answers are generated by an AI
 * (Google Gemini), may be wrong, and that no other person's personal data
 * belongs in the chat — and acknowledges it explicitly. ADR 0005.
 */
export const AI_NOTICE_KEY = "assistant_ai_notice_ack";

export type AiNoticeState = "pending" | "show" | "hidden";

/** Pure: the screen renders from this and branches nowhere else. */
export function resolveNoticeState({
  loaded,
  acknowledged,
}: {
  loaded: boolean;
  acknowledged: boolean;
}): AiNoticeState {
  if (!loaded) return "pending";
  return acknowledged ? "hidden" : "show";
}

export async function readAiNoticeAcknowledged(): Promise<boolean> {
  try {
    return (await localStorage.getItem(AI_NOTICE_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function acknowledgeAiNotice(): Promise<void> {
  await localStorage.setItem(AI_NOTICE_KEY, "1");
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @dragons/native test -- src/lib/assistant/ai-notice.test.ts 2>&1 | tail -n 5`
Expected: 7 tests pass.

- [ ] **Step 5: Write the failing composer test**

Open `apps/native/src/lib/assistant/composer.test.ts` and add inside its `composerButtonState` describe (create one if the file groups differently):
```ts
  it("is disabled while the AI notice gates the composer, whatever the text", () => {
    expect(composerButtonState(false, "hallo", true)).toBe("disabled");
    expect(composerButtonState(true, "hallo", true)).toBe("disabled");
  });

  it("keeps its old behaviour when not gated", () => {
    expect(composerButtonState(false, "hallo", false)).toBe("send");
    expect(composerButtonState(false, "hallo")).toBe("send");
  });
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @dragons/native test -- src/lib/assistant/composer.test.ts 2>&1 | tail -n 5`
Expected: the first new test fails (returns "send" / "stop").

- [ ] **Step 7: Extend composerButtonState**

In `apps/native/src/lib/assistant/composer.ts` replace the function with:
```ts
/**
 * Map (busy, input value, gated) to the morphing send-button variant.
 * A gate (the AI notice, #235) wins over everything; busy wins over text
 * (stop while generating); empty trimmed input is disabled.
 */
export function composerButtonState(
  busy: boolean,
  value: string,
  disabled = false,
): ComposerButtonState {
  if (disabled) return "disabled";
  if (busy) return "stop";
  if (value.trim().length === 0) return "disabled";
  return "send";
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `pnpm --filter @dragons/native test -- src/lib/assistant/composer.test.ts 2>&1 | tail -n 5`
Expected: all pass.

- [ ] **Step 9: Strings**

In `apps/native/src/i18n/de.json`, in the `assistant` group: change `"title"` to `"KI-Assistent"`, `"open"` to `"Den KI-Assistenten fragen"`, and add:
```json
"hint": "Antworten erzeugt Google Gemini – sie können Fehler enthalten.",
"notice": {
  "title": "Du chattest mit einer KI",
  "body": "Die Antworten erzeugt Googles Gemini-Modell aus den Vereinsdaten. Sie können falsch sein – prüfe Spieltermine im Zweifel im offiziellen Spielplan. Gib keine personenbezogenen Daten anderer Personen ein.",
  "acknowledge": "Verstanden"
},
```
In `en.json`: `"title": "AI assistant"`, `"open": "Ask the AI assistant"`, and:
```json
"hint": "Answers are generated by Google Gemini and may contain mistakes.",
"notice": {
  "title": "You are chatting with an AI",
  "body": "Answers are generated by Google's Gemini model from club data. They can be wrong – when in doubt, check fixtures in the official schedule. Do not enter other people's personal data.",
  "acknowledge": "Got it"
},
```
Then: `grep -rn "Vereins-Assistent" apps/native/src` — Expected: no hits left (fix any test that asserted the old title).

- [ ] **Step 10: Hook, card, composer prop, screen**

Create `apps/native/src/hooks/useAiNotice.ts`:
```ts
import { useCallback, useEffect, useState } from "react";
import {
  acknowledgeAiNotice,
  readAiNoticeAcknowledged,
  resolveNoticeState,
  type AiNoticeState,
} from "@/lib/assistant/ai-notice";

/** Loads the acknowledgement once; `acknowledge` flips it and persists. */
export function useAiNotice(): { state: AiNoticeState; acknowledge: () => void } {
  const [loaded, setLoaded] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    let active = true;
    void readAiNoticeAcknowledged().then((value) => {
      if (!active) return;
      setAcknowledged(value);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const acknowledge = useCallback(() => {
    setAcknowledged(true);
    void acknowledgeAiNotice();
  }, []);

  return { state: resolveNoticeState({ loaded, acknowledged }), acknowledge };
}
```
Create `apps/native/src/components/assistant/AiNoticeCard.tsx`:
```tsx
import { Pressable, Text, View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

/** First-interaction AI notice (AI Act Art. 50(1), ADR 0005). */
export function AiNoticeCard({ onAcknowledge }: { onAcknowledge: () => void }) {
  const { colors, spacing, radius, textStyles } = useTheme();
  return (
    <View
      accessibilityRole="summary"
      style={{
        marginTop: spacing.xl,
        padding: spacing.lg,
        gap: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceLow,
      }}
    >
      <Text style={[textStyles.sectionTitle, { color: colors.foreground }]}>
        {i18n.t("assistant.notice.title")}
      </Text>
      <Text style={[textStyles.body, { color: colors.foreground }]}>
        {i18n.t("assistant.notice.body")}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onAcknowledge}
        style={{
          backgroundColor: colors.primary,
          borderRadius: radius.md,
          paddingVertical: spacing.md,
          alignItems: "center",
          minHeight: 44,
        }}
      >
        <Text style={[textStyles.button, { color: colors.primaryForeground }]}>
          {i18n.t("assistant.notice.acknowledge")}
        </Text>
      </Pressable>
    </View>
  );
}
```
In `apps/native/src/components/assistant/ChatComposer.tsx`:
- Add `disabled = false,` to the destructured props and `disabled?: boolean;` to the props type.
- Change `const state = composerButtonState(busy, value);` to `const state = composerButtonState(busy, value, disabled);`.
- On the `TextInput`, add `editable={!disabled}`.

In `apps/native/src/app/assistant.tsx`:
- Add imports: `import { useAiNotice } from "@/hooks/useAiNotice";` and `import { AiNoticeCard } from "@/components/assistant/AiNoticeCard";`.
- Inside `AssistantScreen`, after `const lastUserCount = useRef(0);`, add `const notice = useAiNotice();` (before the `Redirect` early return — hooks stay in a fixed order).
- Change `const { colors, spacing } = useTheme();` to `const { colors, spacing, textStyles } = useTheme();`.
- Replace `ListEmptyComponent={<EmptyState onPick={send} />}` with:
```tsx
        ListEmptyComponent={
          notice.state === "hidden" ? (
            <EmptyState onPick={send} />
          ) : notice.state === "show" ? (
            <AiNoticeCard onAcknowledge={notice.acknowledge} />
          ) : null
        }
```
- Directly above `<ChatComposer` add the permanent hint:
```tsx
          <Text
            style={[
              textStyles.caption,
              { color: colors.mutedForeground, textAlign: "center", paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
            ]}
          >
            {i18n.t("assistant.hint")}
          </Text>
```
- Add `disabled={notice.state !== "hidden"}` to `<ChatComposer … />`.

- [ ] **Step 11: ADR**

Create `docs/adr/0005-ai-assistant-transparency.md`:
```markdown
---
status: accepted
---

# The KI-Assistent discloses itself before the first message

The club puts a Gemini-backed Q&A assistant into service under its own name in the native app (and the web app). Under the AI Act, Art. 50(1) — applicable since 2026-08-02 — that makes the club the provider of an AI system that interacts with natural persons, so users must be informed that they are talking to an AI no later than the first interaction, unless that is obvious. A screen titled "Vereins-Assistent" with a "Neu generieren" button is not obvious. Apple's guideline 5.1.2(i) adds that user content must not reach a third-party AI without explicit permission.

Decision: the feature is named "KI-Assistent" / "AI assistant" everywhere it appears; before the first message on a device the chat shows a notice that answers are generated by Google Gemini, may be wrong, and that no other person's personal data should be entered, with an explicit "Verstanden" that is persisted per device (`assistant_ai_notice_ack`); a one-line hint stays visible under the composer in every state. The classification is transparency-only: the assistant answers questions over public club data and takes no decision about anyone, so none of the high-risk categories of Annex III apply.

Consequences:

- The wording lives in `assistant.notice.*` and `assistant.hint` in the native locale files; changing it is a copy change, not a code change, and both languages change together.
- The web assistant widget carries the same duty and gets the same notice (#236).
- Any new AI feature — a different model, generated content shown to Fans, automated decisions — is a new Art. 50 assessment, recorded as a new ADR.
- The Verzeichnis entry for the assistant (#243) cites this ADR.
```

- [ ] **Step 12: Tests, gate, PRE-LAUNCH, commit**

Run: `pnpm --filter @dragons/native test -- src/i18n src/lib/assistant 2>&1 | grep -E "Tests|FAIL" | head`
Expected: all pass (locale parity covers the new keys).

In `apps/native/PRE-LAUNCH.md` § "Privacy / compliance", in the last item change `the chatbot's AI disclosure (AI Act Art. 50(1)),` to `~~the chatbot's AI disclosure (AI Act Art. 50(1))~~ (done, #235, ADR 0005),`.

Run: `pnpm --filter @dragons/native typecheck && pnpm --filter @dragons/native lint && pnpm --filter @dragons/native coverage 2>&1 | grep -E "Test Files|All files|ERROR" && pnpm check:ai-slop`
Expected: clean; floors hold.
```bash
git add apps/native/src/lib/assistant apps/native/src/hooks/useAiNotice.ts apps/native/src/components/assistant apps/native/src/app/assistant.tsx apps/native/src/i18n docs/adr/0005-ai-assistant-transparency.md apps/native/PRE-LAUNCH.md
git commit -m "feat(native): KI disclosure before the first assistant message (#235)

AI Act Art. 50(1) applies since 2026-08-02 and Apple 5.1.2(i) wants
explicit permission before content reaches a third-party AI. The
assistant is renamed KI-Assistent, shows a one-time acknowledged notice
and a permanent hint. ADR 0005 records the classification."
```

---

### Task 7: Push permission split and the pre-prompt decision (#237, lib)

**Files:**
- Modify: `apps/native/src/lib/push/registration.ts`
- Test: `apps/native/src/lib/push/registration.test.ts`
- Create: `apps/native/src/lib/push/pre-prompt.ts`
- Test: `apps/native/src/lib/push/pre-prompt.test.ts`

**Interfaces:**
- Consumes: `localStorage`, expo-notifications, `deviceApi`
- Produces (`registration.ts`):
  - `type PushPermissionStatus = "granted" | "denied" | "undetermined"`
  - `getPushPermissionStatus(): Promise<PushPermissionStatus>`
  - `registerForPush(): Promise<void>` — registers only when already granted; never prompts
  - `requestPushPermissionAndRegister(): Promise<PushPermissionStatus>` — the one place the OS prompt is triggered
  - `unregisterForPush()` unchanged
- Produces (`pre-prompt.ts`):
  - `PUSH_PROMPT_DEFERRED_KEY = "push_prompt_deferred"`
  - `type PushFlow = "register" | "prompt" | "none"`
  - `decidePushFlow({ isDevice, signedIn, status, deferred }): PushFlow`
  - `readPushPromptDeferred(): Promise<boolean>`, `deferPushPrompt(): Promise<void>`, `clearPushPromptDeferral(): Promise<void>`
  - `pushStatusLabelKey(status: PushPermissionStatus): string`

- [ ] **Step 1: Rewrite the registration tests to the new contract (failing)**

Replace the `describe("registerForPush", …)` block in `apps/native/src/lib/push/registration.test.ts` with, and extend the import line to `import { getPushPermissionStatus, registerForPush, requestPushPermissionAndRegister, unregisterForPush } from "@/lib/push/registration";`:
```ts
describe("getPushPermissionStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    [{ status: "granted", canAskAgain: true }, "granted"],
    [{ status: "undetermined", canAskAgain: true }, "undetermined"],
    [{ status: "denied", canAskAgain: false }, "denied"],
    // iOS reports "undetermined" with canAskAgain=false after a hard deny.
    [{ status: "undetermined", canAskAgain: false }, "denied"],
  ])("maps %o to %s", async (permission, expected) => {
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue(permission as never);
    expect(await getPushPermissionStatus()).toBe(expected);
  });
});

describe("registerForPush", () => {
  beforeEach(() => vi.clearAllMocks());

  it("registers the token when permission is already granted", async () => {
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "granted" } as never);
    vi.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({ data: "tok-1" } as never);
    await registerForPush();
    expect(deviceApi.register).toHaveBeenCalledWith("tok-1", "ios", "de-DE");
  });

  it("never triggers the OS prompt itself (the pre-permission sheet does, #237)", async () => {
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "undetermined", canAskAgain: true } as never);
    await registerForPush();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(deviceApi.register).not.toHaveBeenCalled();
  });

  it("passes undefined as locale when getLocales returns empty array", async () => {
    vi.mocked(getLocales).mockReturnValueOnce([] as never);
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "granted" } as never);
    vi.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({ data: "tok-2" } as never);
    await registerForPush();
    expect(deviceApi.register).toHaveBeenCalledWith("tok-2", "ios", undefined);
  });

  it("swallows a token failure with a warning (a build without FCM keeps working)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "granted" } as never);
    vi.mocked(Notifications.getExpoPushTokenAsync).mockRejectedValue(new Error("no FCM"));
    await registerForPush();
    expect(deviceApi.register).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("requestPushPermissionAndRegister", () => {
  beforeEach(() => vi.clearAllMocks());

  it("prompts, and registers on grant", async () => {
    vi.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({ status: "granted" } as never);
    vi.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({ data: "tok-3" } as never);
    expect(await requestPushPermissionAndRegister()).toBe("granted");
    expect(deviceApi.register).toHaveBeenCalledWith("tok-3", "ios", "de-DE");
  });

  it("prompts, and does not register on denial", async () => {
    vi.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({ status: "denied" } as never);
    expect(await requestPushPermissionAndRegister()).toBe("denied");
    expect(deviceApi.register).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `pnpm --filter @dragons/native test -- src/lib/push/registration.test.ts 2>&1 | grep -E "Tests|FAIL|×" | head`
Expected: the `getPushPermissionStatus` and `requestPushPermissionAndRegister` tests fail (not exported); "never triggers the OS prompt" fails.

- [ ] **Step 3: Rewrite registration.ts**

Replace everything from `/** Request notification permission …` through the end of `registerForPush` in `apps/native/src/lib/push/registration.ts` with:
```ts
export type PushPermissionStatus = "granted" | "denied" | "undetermined";

/**
 * The OS permission state, collapsed to what the pre-permission flow needs.
 * iOS reports `undetermined` with `canAskAgain: false` after a hard deny;
 * that is a denial for our purposes — the prompt would be a no-op.
 */
export async function getPushPermissionStatus(): Promise<PushPermissionStatus> {
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status === "granted") return "granted";
  if (status === "undetermined" && canAskAgain !== false) return "undetermined";
  return "denied";
}

async function registerToken(projectId: string): Promise<void> {
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const locale = getLocales()[0]?.languageTag;
    const platform = Platform.OS === "android" ? "android" : "ios";
    await deviceApi.register(token, platform, locale);
  } catch (err) {
    console.warn("[push] registration failed", err);
  }
}

/**
 * Acquire the Expo push token and register it with the API when permission is
 * already granted. Safe to call on every app boot — the server upserts by
 * token. Never triggers the OS prompt: § 25(1) TDDDG wants an explanation
 * first, which is `app/push-permission.tsx` (#237) calling
 * `requestPushPermissionAndRegister`.
 *
 * No-ops on simulators and when projectId / permission is missing.
 */
export async function registerForPush(): Promise<void> {
  if (!Device.isDevice) return;

  const projectId = getProjectId();
  if (!projectId) {
    console.warn("[push] missing EAS projectId, push disabled");
    return;
  }

  if ((await getPushPermissionStatus()) !== "granted") return;
  await registerToken(projectId);
}

/** The one call site of the OS prompt. Registers on grant. */
export async function requestPushPermissionAndRegister(): Promise<PushPermissionStatus> {
  if (!Device.isDevice) return "denied";

  const projectId = getProjectId();
  if (!projectId) {
    console.warn("[push] missing EAS projectId, push disabled");
    return "denied";
  }

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return "denied";
  await registerToken(projectId);
  return "granted";
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter @dragons/native test -- src/lib/push/registration.test.ts 2>&1 | tail -n 5`
Expected: all 11 tests pass.

- [ ] **Step 5: Write the failing pre-prompt tests**

Create `apps/native/src/lib/push/pre-prompt.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const getItem = vi.fn();
const setItem = vi.fn();
vi.mock("@/lib/local-storage", () => ({
  localStorage: {
    getItem: (...a: unknown[]) => getItem(...a),
    setItem: (...a: unknown[]) => setItem(...a),
  },
}));

import {
  PUSH_PROMPT_DEFERRED_KEY,
  clearPushPromptDeferral,
  decidePushFlow,
  deferPushPrompt,
  pushStatusLabelKey,
  readPushPromptDeferred,
} from "@/lib/push/pre-prompt";

describe("decidePushFlow", () => {
  const base = { isDevice: true, signedIn: true, deferred: false } as const;

  it("registers silently when the OS already granted permission", () => {
    expect(decidePushFlow({ ...base, status: "granted" })).toBe("register");
  });

  it("shows the explanation when the OS has not been asked and the user has not deferred", () => {
    expect(decidePushFlow({ ...base, status: "undetermined" })).toBe("prompt");
  });

  it("stays quiet after a deferral", () => {
    expect(decidePushFlow({ ...base, status: "undetermined", deferred: true })).toBe("none");
  });

  it("stays quiet after a denial — Settings is the only way back", () => {
    expect(decidePushFlow({ ...base, status: "denied" })).toBe("none");
  });

  it("does nothing signed out or on a simulator", () => {
    expect(decidePushFlow({ ...base, status: "granted", signedIn: false })).toBe("none");
    expect(decidePushFlow({ ...base, status: "undetermined", isDevice: false })).toBe("none");
  });
});

describe("deferral storage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the deferral flag", async () => {
    getItem.mockResolvedValue("1");
    expect(await readPushPromptDeferred()).toBe(true);
    expect(getItem).toHaveBeenCalledWith(PUSH_PROMPT_DEFERRED_KEY);
  });

  it("treats a missing flag or a storage failure as not deferred", async () => {
    getItem.mockResolvedValue(null);
    expect(await readPushPromptDeferred()).toBe(false);
    getItem.mockRejectedValue(new Error("disk"));
    expect(await readPushPromptDeferred()).toBe(false);
  });

  it("writes and clears the flag", async () => {
    setItem.mockResolvedValue(undefined);
    await deferPushPrompt();
    expect(setItem).toHaveBeenCalledWith(PUSH_PROMPT_DEFERRED_KEY, "1");
    await clearPushPromptDeferral();
    expect(setItem).toHaveBeenCalledWith(PUSH_PROMPT_DEFERRED_KEY, "0");
  });
});

describe("pushStatusLabelKey", () => {
  it("maps every status to a locale key", () => {
    expect(pushStatusLabelKey("granted")).toBe("push.statusGranted");
    expect(pushStatusLabelKey("denied")).toBe("push.statusDenied");
    expect(pushStatusLabelKey("undetermined")).toBe("push.statusUndetermined");
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm --filter @dragons/native test -- src/lib/push/pre-prompt.test.ts 2>&1 | tail -n 5`
Expected: FAIL — cannot resolve `@/lib/push/pre-prompt`.

- [ ] **Step 7: Implement pre-prompt.ts**

Create `apps/native/src/lib/push/pre-prompt.ts`:
```ts
import { localStorage } from "@/lib/local-storage";
import type { PushPermissionStatus } from "./registration";

/**
 * Push pre-permission (#237). § 25(1) TDDDG asks for "klare und umfassende
 * Informationen" before the OS prompt, and iOS only ever shows that prompt
 * once — so the app explains first, and a "Später" costs nothing. The
 * deferral is per device; Profile's notifications row clears it.
 */
export const PUSH_PROMPT_DEFERRED_KEY = "push_prompt_deferred";

export type PushFlow = "register" | "prompt" | "none";

export function decidePushFlow({
  isDevice,
  signedIn,
  status,
  deferred,
}: {
  isDevice: boolean;
  signedIn: boolean;
  status: PushPermissionStatus;
  deferred: boolean;
}): PushFlow {
  if (!isDevice || !signedIn) return "none";
  if (status === "granted") return "register";
  if (status === "undetermined" && !deferred) return "prompt";
  return "none";
}

export async function readPushPromptDeferred(): Promise<boolean> {
  try {
    return (await localStorage.getItem(PUSH_PROMPT_DEFERRED_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function deferPushPrompt(): Promise<void> {
  await localStorage.setItem(PUSH_PROMPT_DEFERRED_KEY, "1");
}

/** `localStorage` has no remove; "0" reads back as not deferred. */
export async function clearPushPromptDeferral(): Promise<void> {
  await localStorage.setItem(PUSH_PROMPT_DEFERRED_KEY, "0");
}

const STATUS_LABEL_KEYS: Record<PushPermissionStatus, string> = {
  granted: "push.statusGranted",
  denied: "push.statusDenied",
  undetermined: "push.statusUndetermined",
};

export function pushStatusLabelKey(status: PushPermissionStatus): string {
  return STATUS_LABEL_KEYS[status];
}
```

- [ ] **Step 8: Run to verify they pass, then commit**

Run: `pnpm --filter @dragons/native test -- src/lib/push 2>&1 | grep -E "Tests|FAIL" | head`
Expected: all pass (registration, pre-prompt, handler).
```bash
git add apps/native/src/lib/push
git commit -m "refactor(native): split the push OS prompt from registration (#237)

registerForPush no longer asks the OS; requestPushPermissionAndRegister
is the single prompt site, and pre-prompt.ts decides between silent
registration, the explanation sheet, and nothing."
```

---

### Task 8: Push pre-permission sheet, hook wiring, Profile row (#237, UI)

**Files:**
- Create: `apps/native/src/app/push-permission.tsx`
- Modify: `apps/native/src/app/_layout.tsx` (Stack.Screen)
- Modify: `apps/native/src/lib/nav/href.ts` (`APP_ROUTES["/push-permission"]`)
- Modify: `apps/native/src/lib/nav/routes.test.ts` (session-gated list)
- Modify: `apps/native/src/hooks/usePushRegistration.ts`
- Create: `apps/native/src/components/PushSettingsRow.tsx`
- Modify: `apps/native/src/app/profile.tsx`
- Modify: `apps/native/src/i18n/de.json`, `en.json` (`push` group)
- Modify: `apps/native/PRE-LAUNCH.md`

**Interfaces:**
- Consumes: Task 7 — `getPushPermissionStatus`, `registerForPush`, `requestPushPermissionAndRegister`, `decidePushFlow`, `readPushPromptDeferred`, `deferPushPrompt`, `clearPushPromptDeferral`, `pushStatusLabelKey`; `formSheetOptions` from `@/lib/nav/sheet-routes`; `SheetScreen`
- Produces: route `/push-permission`

- [ ] **Step 1: Write the failing route-tree assertions**

In `apps/native/src/lib/nav/routes.test.ts`, in the test `"treats every session-gated screen as non-public"`, add `"/push-permission"` to the array. The `"matches the typed-href route table one for one"` test will fail on its own once the route file exists but `APP_ROUTES` lacks it, and vice versa.

- [ ] **Step 2: Run to verify the current state**

Run: `pnpm --filter @dragons/native test -- src/lib/nav/routes.test.ts 2>&1 | grep -E "Tests|×" | head`
Expected: the session-gated test still passes (no route yet means `isPublicDeepLink` is false); note this — the real check comes after Step 4.

- [ ] **Step 3: Strings**

Add a top-level `push` group to `de.json`:
```json
"push": {
  "title": "Mitteilungen vom Verein",
  "point1": "Wir schicken nur, was dich betrifft: Spielverlegungen, Schiedsrichter-Einsätze und Erinnerungen an Aufgaben.",
  "point2": "Die Zustellung läuft über den Push-Dienst von Expo an Apple bzw. Google. Auf dem Vereinsserver liegt nur dein Geräte-Token.",
  "point3": "Beim Abmelden wird das Token gelöscht.",
  "point4": "Abschalten kannst du Mitteilungen jederzeit in den Systemeinstellungen.",
  "enable": "Mitteilungen aktivieren",
  "later": "Später",
  "settingsRow": "Mitteilungen",
  "statusGranted": "Aktiv",
  "statusDenied": "Aus – in den Einstellungen aktivieren",
  "statusUndetermined": "Noch nicht eingerichtet"
},
```
and to `en.json`:
```json
"push": {
  "title": "Notifications from the club",
  "point1": "We only send what concerns you: rescheduled games, referee assignments and task reminders.",
  "point2": "Delivery runs through Expo's push service to Apple or Google. The club server stores only your device token.",
  "point3": "The token is deleted when you sign out.",
  "point4": "You can switch notifications off at any time in the system settings.",
  "enable": "Enable notifications",
  "later": "Later",
  "settingsRow": "Notifications",
  "statusGranted": "On",
  "statusDenied": "Off – enable in Settings",
  "statusUndetermined": "Not set up yet"
},
```

- [ ] **Step 4: The route**

Create `apps/native/src/app/push-permission.tsx`:
```tsx
import { useEffect, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { SheetScreen } from "@/components/sheets/SheetScreen";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { requestPushPermissionAndRegister } from "@/lib/push/registration";
import { deferPushPrompt } from "@/lib/push/pre-prompt";

const POINTS = ["push.point1", "push.point2", "push.point3", "push.point4"] as const;

/**
 * Push pre-permission sheet (#237). Opens from `usePushRegistration` after
 * sign-in when the OS has not been asked yet, and from Profile. "Aktivieren"
 * is the only path to the OS prompt; "Später" and a swipe-dismiss both defer,
 * so the sheet never nags on the next launch.
 */
export default function PushPermissionSheet() {
  const { colors, spacing, radius, textStyles } = useTheme();
  // Anything but an explicit enable — Später, swipe, back — counts as deferral.
  const enabled = useRef(false);

  useEffect(() => {
    return () => {
      if (!enabled.current) void deferPushPrompt();
    };
  }, []);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  const enable = async () => {
    enabled.current = true;
    await requestPushPermissionAndRegister();
    close();
  };

  return (
    <SheetScreen title={i18n.t("push.title")} layout="scroll" testID="push-permission-sheet">
      <View style={{ gap: spacing.md }}>
        {POINTS.map((key) => (
          <Text key={key} style={[textStyles.body, { color: colors.foreground }]}>
            {i18n.t(key)}
          </Text>
        ))}
      </View>
      <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
        <Pressable
          accessibilityRole="button"
          onPress={() => { void enable(); }}
          style={{
            backgroundColor: colors.primary,
            borderRadius: radius.md,
            paddingVertical: spacing.md,
            alignItems: "center",
            minHeight: 48,
          }}
        >
          <Text style={[textStyles.button, { color: colors.primaryForeground }]}>
            {i18n.t("push.enable")}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={close}
          style={{ paddingVertical: spacing.md, alignItems: "center", minHeight: 44 }}
        >
          <Text style={[textStyles.button, { color: colors.mutedForeground }]}>
            {i18n.t("push.later")}
          </Text>
        </Pressable>
      </View>
    </SheetScreen>
  );
}
```
Check that `SheetScreen`'s `"scroll"` layout renders children inside its scroll container (read the remainder of `components/sheets/SheetScreen.tsx`); if the `"fit"` layout is all the sheet needs (four short paragraphs fit at the half detent), use `layout="fit"` and `detents: "fitToContents"` in Step 5 instead.

- [ ] **Step 5: Register the route**

In `apps/native/src/app/_layout.tsx`:
- Change the sheet-routes import to `import { formSheetOptions, searchSheetOptions } from "@/lib/nav/sheet-routes";`.
- After the `assistant` `Stack.Screen`, add:
```tsx
        {/* Push pre-permission (#237): a form sheet the sign-in flow opens once
            when the OS has not been asked yet; Profile can reopen it. */}
        <Stack.Screen
          name="push-permission"
          options={formSheetOptions({ name: "push-permission", detents: [0.5, 1] })}
        />
```
In `apps/native/src/lib/nav/href.ts`, add `"/push-permission": () => "/push-permission",` after the `"/assistant"` line.

Run: `pnpm --filter @dragons/native typecheck && pnpm --filter @dragons/native test -- src/lib/nav 2>&1 | grep -E "Tests|×|FAIL" | head`
Expected: typecheck regenerates `router.d.ts` and passes; the route-table and session-gated tests pass.

- [ ] **Step 6: Hook wiring**

Replace `apps/native/src/hooks/usePushRegistration.ts` with:
```ts
import { useEffect, useRef } from "react";
import * as Device from "expo-device";
import { router } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { getPushPermissionStatus, registerForPush } from "@/lib/push/registration";
import { decidePushFlow, readPushPromptDeferred } from "@/lib/push/pre-prompt";
import {
  setPushAuthState,
  subscribeToTaps,
  type PushAuthState,
} from "@/lib/push/handler";

/**
 * Mounts the push tap subscription and, whenever an authenticated session
 * exists, either registers the device's push token (permission already
 * granted) or opens the pre-permission sheet once (#237).
 *
 * Must be mounted INSIDE the auth tree (so the session is available)
 * and above any screen that expects taps to deep-link.
 */
export function usePushRegistration(): void {
  const { data: session, isPending } = authClient.useSession();
  // One sheet per sign-in: the effect re-runs on the same user id only after
  // sign-out, which resets this.
  const prompted = useRef(false);

  // Feed the session state to the deep-link gate FIRST, so a cold-start tap
  // resolved by the subscription below is held rather than followed blind.
  // While `isPending`, "no session" is indistinguishable from "not restored
  // yet", so the gate is told neither.
  const pushAuthState: PushAuthState = isPending
    ? "unknown"
    : session?.user
      ? "signed-in"
      : "signed-out";
  useEffect(() => {
    setPushAuthState(pushAuthState);
  }, [pushAuthState]);

  // Decide once per session (every boot — server upserts idempotently).
  useEffect(() => {
    if (!session?.user) {
      prompted.current = false;
      return;
    }
    let cancelled = false;
    void (async () => {
      const [status, deferred] = await Promise.all([
        getPushPermissionStatus(),
        readPushPromptDeferred(),
      ]);
      if (cancelled) return;
      const flow = decidePushFlow({ isDevice: Device.isDevice, signedIn: true, status, deferred });
      if (flow === "register") {
        await registerForPush();
      } else if (flow === "prompt" && !prompted.current) {
        prompted.current = true;
        router.push("/push-permission");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  // Tap subscription + cold-start tap check. Subscribe once.
  useEffect(() => {
    return subscribeToTaps();
  }, []);
}
```

- [ ] **Step 7: Profile row**

Create `apps/native/src/components/PushSettingsRow.tsx`:
```tsx
import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { getPushPermissionStatus, type PushPermissionStatus } from "@/lib/push/registration";
import { clearPushPromptDeferral, pushStatusLabelKey } from "@/lib/push/pre-prompt";

/**
 * "Mitteilungen" on Profile (#237): shows the OS status and routes the user to
 * the right place — the explanation sheet while the OS has not been asked,
 * the system settings otherwise (that is where iOS lets it be switched).
 * Re-reads the status when the app returns from Settings.
 */
export function PushSettingsRow() {
  const { colors, textStyles, spacing } = useTheme();
  const [status, setStatus] = useState<PushPermissionStatus | null>(null);

  const refresh = useCallback(() => {
    void getPushPermissionStatus().then(setStatus);
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const onPress = () => {
    if (status === "undetermined") {
      void clearPushPromptDeferral();
      router.push("/push-permission");
      return;
    }
    void Linking.openSettings();
  };

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={status === null}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: spacing.sm,
        minHeight: 44,
      }}
    >
      <Text style={[textStyles.body, { color: colors.foreground }]}>{i18n.t("push.settingsRow")}</Text>
      <View>
        <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
          {status ? i18n.t(pushStatusLabelKey(status)) : ""}
        </Text>
      </View>
    </Pressable>
  );
}
```
In `apps/native/src/app/profile.tsx`, add `import { PushSettingsRow } from "@/components/PushSettingsRow";` and, in the signed-in branch directly before the `{/* Biometric lock section */}` block, add:
```tsx
        {/* Notifications (#237) */}
        <View>
          <SectionHeader title={i18n.t("push.settingsRow")} />
          <PushSettingsRow />
        </View>
```

- [ ] **Step 8: Docs, gate, commit**

In `apps/native/PRE-LAUNCH.md` § "Push notifications — already committed, live in code", after the paragraph ending `(\`registration.test.ts\`, \`handler.test.ts\`).` add:
```markdown
Since #237 the OS prompt is no longer fired from `registerForPush`. Sign-in
opens `app/push-permission.tsx` — a form sheet explaining what the club
sends, that Expo delivers it to Apple/Google, that the token dies on
sign-out and how to switch it off — and only its "Aktivieren" button calls
`requestPushPermissionAndRegister`. "Später" and swipe-dismiss defer per
device (`push_prompt_deferred`); Profile's "Mitteilungen" row reopens the
sheet or, once the OS has answered, opens the system settings. § 25(1)
TDDDG is the reason; the decision table is `lib/push/pre-prompt.ts`.
```
Also in § "Privacy / compliance", last item, change `the push pre-permission text,` to `~~the push pre-permission text~~ (done, #237),`.

Run: `pnpm --filter @dragons/native typecheck && pnpm --filter @dragons/native lint && pnpm --filter @dragons/native coverage 2>&1 | grep -E "Test Files|All files|ERROR" && pnpm check:ai-slop`
Expected: clean; floors hold (two new untested component files against ~25 new covered statements in Task 7 — if statements fall below 17.00, move `PushSettingsRow`'s `onPress` decision into `pre-prompt.ts` as `pushRowAction(status): "prompt" | "settings"` with a test, and call it from the row).
```bash
git add apps/native/src/app/push-permission.tsx apps/native/src/app/_layout.tsx apps/native/src/lib/nav apps/native/src/hooks/usePushRegistration.ts apps/native/src/components/PushSettingsRow.tsx apps/native/src/app/profile.tsx apps/native/src/i18n apps/native/PRE-LAUNCH.md
git commit -m "feat(native): explain push notifications before the OS prompt (#237)

§ 25(1) TDDDG wants clear information before the permission dialog, and
iOS shows that dialog once. A form sheet opens after sign-in while the
OS is undetermined; Später defers per device; Profile shows the status
and reopens the sheet or the system settings."
```

---

### Task 9: Host `apple-app-site-association` (#248)

**Files:**
- Create: `apps/web/public/.well-known/apple-app-site-association`
- Modify: `apps/web/next.config.ts` (`headers()`)
- Test: `apps/web/src/aasa.test.ts`
- Modify: `apps/native/PRE-LAUNCH.md` (universal-links item)

**Interfaces:**
- Consumes: `PUBLIC_PATH_PREFIXES` from `apps/web/src/proxy.ts`; `ios.appleTeamId` + `ios.bundleIdentifier` from `apps/native/app.json`
- Produces: the hosted file

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/aasa.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// proxy.ts pulls next-intl/middleware, whose nested next/server copy trips
// vitest's resolver (see proxy.test.ts). Only the prefix list is needed here.
vi.mock("next-intl/middleware", () => ({ default: () => () => undefined }));

import { PUBLIC_PATH_PREFIXES } from "./proxy";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AASA_PATH = path.join(__dirname, "../public/.well-known/apple-app-site-association");
const NEXT_CONFIG_PATH = path.join(__dirname, "../next.config.ts");
const NATIVE_APP_JSON = path.join(__dirname, "../../native/app.json");

interface Aasa {
  applinks: { details: { appIDs: string[]; components: { "/": string; exclude?: boolean }[] }[] };
}

const aasa = JSON.parse(fs.readFileSync(AASA_PATH, "utf8")) as Aasa;
const detail = aasa.applinks.details[0]!;
const { expo } = JSON.parse(fs.readFileSync(NATIVE_APP_JSON, "utf8")) as {
  expo: { ios: { appleTeamId: string; bundleIdentifier: string } };
};

/** Web prefixes that have a screen in the native app (`lib/nav/href.ts`). */
const APP_ROUTED_PREFIXES = ["/schedule", "/standings", "/teams", "/team", "/game", "/h2h"];

/**
 * Universal links (#217/#248): the entitlement in the binary is inert until
 * this file is served on app.hbdragons.de. The appID must name the Apple
 * team the binary is signed with, so it is read from the native config
 * rather than typed twice — the team conversion (#246) keeps the id, but a
 * fallback enrollment would not.
 */
describe("apple-app-site-association", () => {
  it("names the team and bundle id the native binary is built with", () => {
    expect(detail.appIDs).toEqual([`${expo.ios.appleTeamId}.${expo.ios.bundleIdentifier}`]);
  });

  it("claims every public web prefix that has a native screen", () => {
    for (const prefix of APP_ROUTED_PREFIXES) {
      expect(PUBLIC_PATH_PREFIXES, `${prefix} is no longer public on the web`).toContain(prefix);
      const claimed = detail.components.some((c) => !c.exclude && c["/"].startsWith(prefix));
      expect(claimed, `${prefix} is not claimed`).toBe(true);
    }
  });

  it("leaves the English locale prefix and session-gated surfaces to the browser", () => {
    const excluded = detail.components.filter((c) => c.exclude).map((c) => c["/"]);
    expect(excluded).toEqual(expect.arrayContaining(["/en/*", "/admin/*", "/profile"]));
    // Exclusions must come first: Apple evaluates components in order.
    const firstClaim = detail.components.findIndex((c) => !c.exclude);
    const lastExclude = detail.components.map((c) => Boolean(c.exclude)).lastIndexOf(true);
    expect(lastExclude).toBeLessThan(firstClaim);
  });

  it("is served as application/json (Next.js would otherwise send octet-stream for an extension-less file)", () => {
    const config = fs.readFileSync(NEXT_CONFIG_PATH, "utf8");
    const rule = /source:\s*"\/\.well-known\/apple-app-site-association"[\s\S]*?value:\s*"application\/json"/;
    expect(config).toMatch(rule);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @dragons/web test -- src/aasa.test.ts 2>&1 | tail -n 6`
Expected: FAIL — ENOENT on the AASA file.

- [ ] **Step 3: Create the file and the header rule**

Create `apps/web/public/.well-known/apple-app-site-association`:
```json
{
  "applinks": {
    "details": [
      {
        "appIDs": ["2ZDTV3KLV2.de.hbdragons.app"],
        "components": [
          { "/": "/en/*", "exclude": true, "comment": "English pages have no native route; Safari" },
          { "/": "/admin/*", "exclude": true, "comment": "session-gated web surface" },
          { "/": "/profile", "exclude": true, "comment": "session-gated web surface" },
          { "/": "/schedule*" },
          { "/": "/standings*" },
          { "/": "/teams*" },
          { "/": "/team/*" },
          { "/": "/game/*" },
          { "/": "/h2h/*" }
        ]
      }
    ]
  }
}
```
In `apps/web/next.config.ts`, inside the array returned by `headers()`, add a second element after the existing `/(.*)` rule:
```ts
      {
        // Universal links (#248). Extension-less public files are served as
        // application/octet-stream by default; Apple's CDN needs JSON.
        source: "/.well-known/apple-app-site-association",
        headers: [{ key: "Content-Type", value: "application/json" }],
      },
```

- [ ] **Step 4: Run to verify it passes, plus the web gate**

Run: `pnpm --filter @dragons/web test -- src/aasa.test.ts 2>&1 | tail -n 5`
Expected: 4 tests pass.
Run: `pnpm --filter @dragons/web typecheck && pnpm --filter @dragons/web lint 2>&1 | tail -n 2 && pnpm --filter @dragons/web coverage 2>&1 | grep -E "Test Files|All files|ERROR"`
Expected: clean; web floors unchanged (no source change).

- [ ] **Step 5: PRE-LAUNCH**

In `apps/native/PRE-LAUNCH.md` § "iOS universal links", change the `- [ ] Host \`/.well-known/apple-app-site-association\` on \`app.hbdragons.de\`.` item's opening to `- [x] ~~Host \`/.well-known/apple-app-site-association\` on \`app.hbdragons.de\`.~~ Shipped in \`apps/web/public/.well-known/\` with a JSON content-type rule in \`next.config.ts\` (#248); \`apps/web/src/aasa.test.ts\` reads the team and bundle id from \`app.json\`. Still to verify after the next web deploy — the curl checks below, Apple's CDN, and a tapped link on a post-#217 device build.` and keep the rest of the item (the explanation of why it is the activation step) as the following sentences.

- [ ] **Step 6: Commit**

```bash
pnpm check:ai-slop
git add apps/web/public/.well-known apps/web/next.config.ts apps/web/src/aasa.test.ts apps/native/PRE-LAUNCH.md
git commit -m "feat(web): serve apple-app-site-association for app.hbdragons.de (#248)

Activates the associated-domains entitlement compiled into the native
binary. Claims the locale-less public paths that have native screens,
excludes /en/* and session-gated surfaces, and forces application/json."
```

---

### Task 10: Whole-branch verification

**Files:** none new

- [ ] **Step 1: Run the repo-wide gates CI runs**

Run:
```bash
pnpm typecheck 2>&1 | tail -n 3
pnpm lint 2>&1 | grep -E "problems|error" | tail -n 3
pnpm --filter @dragons/native coverage 2>&1 | grep -E "Test Files|All files|ERROR"
pnpm --filter @dragons/web coverage 2>&1 | grep -E "Test Files|All files|ERROR"
pnpm --filter @dragons/site test 2>&1 | grep -E "Test Files|ERROR"
pnpm --filter @dragons/native check:doctor 2>&1 | tail -n 1
pnpm knip 2>&1 | tail -n 8
pnpm check:ai-slop && pnpm check:skipped-tests && pnpm check:i18n 2>&1 | tail -n 2
```
Expected: everything green. If `knip` reports an unused export, it is one of the new modules — either use it or delete it (do not add an ignore).

- [ ] **Step 2: Review the branch diff for stray files**

Run: `git status --short && git log --oneline main..HEAD`
Expected: clean tree; nine commits (spec + eight tasks) plus this plan.

- [ ] **Step 3: Update the tracking issue**

Run:
```bash
gh issue comment 230 -R hb-dragons/dragons-hub --body "Code track landed on \`feat/native-store-readiness\`: #231 #232 #233 #234 #235 #237 #248. Remaining in the tracker: #236 (web KI notice), #242 (Impressum), and the account-gated items."
```
Then invoke `superpowers:finishing-a-development-branch` to decide merge vs. PR.
