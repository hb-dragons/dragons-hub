# Native app — builds, channels, OTA updates

How to ship the Dragons native app: EAS builds per channel, internal
distribution to test users, OTA JS updates. Runbook for repeated use.

Assumes `cd apps/native` unless stated otherwise.

---

## Concepts (read once)

- **Channel** = label that ties a binary build to a pool of JS updates.
  Defined per-profile in `eas.json`. Three channels here: `development`,
  `preview`, `production`.
- **Build** = native binary (`.ipa` / `.aab`) produced by EAS. A build
  listens on exactly one channel — the channel the profile declared at
  build time.
- **Update** = JS bundle published with `eas update --branch <name>`.
  Reaches every installed build that listens on the matching channel AND
  has a matching `runtimeVersion`.
- **`runtimeVersion`** (set to `{ "policy": "appVersion" }` in
  `app.json`): the update's runtime = the `version` string in `app.json`
  at publish time. Updates only reach builds whose `version` matches.
  Bump `version` → must rebuild before testers can receive further
  updates on that version.
- **Env vars** (`EXPO_PUBLIC_*`): baked in by the profile used at both
  build time and update time. Run `eas build --profile preview` and
  `eas update --branch preview` and you get the `preview` env from
  `eas.json` automatically.

---

## Current state (as of 2026-08-25)

- Expo SDK 57 (`expo` / `expo-router` 57.0.16, react-native 0.86.2),
  since #213. `ios.deploymentTarget` is pinned to `16.4` in `app.json`.
- `eas update:configure` has been run. `app.json` has
  `updates.url = https://u.expo.dev/7b7481e3-ca0a-42dd-ba38-6a9169d6492d`
  and the EAS project is bound.
- `expo-updates` is installed and registered as a plugin.
- `runtimeVersion.policy = "appVersion"`, `updates.checkAutomatically =
  ON_LOAD`, `fallbackToCacheTimeout = 0`.
- `eas.json` has three profiles, each with a channel + `EXPO_PUBLIC_API_URL`:
  - `development` → `http://localhost:3001`
  - `preview` → `https://api.app.hbdragons.de`
  - `production` → `https://api.app.hbdragons.de`
- EAS account: organization `hb-dragons` (transferred from the personal
  `eshamounskerto` account 2026-09-01, #239; projectId and updates URL
  unchanged by the transfer). The Apple team still has the personal-account
  problem, see `PRE-LAUNCH.md` § Account / ownership.

**Builds:** six exist, all iOS, all on **SDK 55** (`eas build:list`,
2026-08-25). April 2026: one `production` and three `preview` builds
(`internal` distribution, numbered 1, 1 and 2). 2026-08-10: two `preview`
builds with `store` distribution — build 3 errored, build 4 finished and
is the newest binary. At the time of that snapshot no Android build had
ever been made and the SDK 57 code had never been built; since then the
first Android `preview` builds exist (2026-08-28, SDK 57, `store`
distribution, version code 4 finished — `eas build:list`). The two April TestFlight uploads
(version 1.0.0 builds 1 and 2) have **expired** (see the 90-day rule
below), so no tester currently has an installable binary.

**Updates:** none. No `eas update` has ever been published on any
branch, so `development` and `preview` both show an empty update group,
and there is no `production` channel yet (`eas channel:list`).

**Consequence for the next release:** every existing binary is SDK 55 and
the project moved to SDK 57 in #213 on 2026-08-11, which is a rebuild on
its own. The April binaries are worse off: they are also
fingerprint-incompatible with today's JS —
`react-native-reanimated` + `react-native-worklets`, gesture-handler,
keyboard-controller, glass-effect, datetimepicker, segmented-control,
haptics, clipboard and device all landed after the last build, and
camera / web-browser were removed. `@gorhom/bottom-sheet` is on neither
list any more: it arrived after that build and left again in #225, once
every sheet had become a native form-sheet route. (An earlier revision
of this line also listed `linking` as removed; it never was — see
`PRE-LAUNCH.md`, expo-router requires it.) OTA cannot bridge any of it.
Verify before assuming otherwise:

```bash
eas fingerprint:compare --build-id <id>   # from `eas build:list`
```

---

## First-time setup (per machine)

```bash
# Install the EAS CLI globally if you don't have it
npm i -g eas-cli

# Sign in with an account that is a member of the hb-dragons organization
eas login
eas whoami   # any member of the hb-dragons org works; the project is @hb-dragons/dragons
```

---

## Build a channel (required once per native change)

A binary only receives updates for its own channel. Each channel needs
at least one build.

### Preview (tester builds)

```bash
eas build --profile preview --platform ios
eas build --profile preview --platform android
```

### Production (public release)

```bash
eas build --profile production --platform ios
eas build --profile production --platform android
```

### Development (custom dev client)

Only needed for local development with Expo Go-style hot reload but
with native modules. Points at `localhost:3001`. Use your LAN IP if
testing on a physical device.

```bash
eas build --profile development --platform ios
eas build --profile development --platform android
```

Builds run in EAS cloud (~10–20 min each). Output: `.ipa` / `.aab` +
install link.

**Rebuild required when:**

- Bumping `version` in `app.json`
- Adding/removing native dependency (anything with an Expo config plugin)
- Changing permissions, entitlements, or `app.json` native keys
- Bumping the Expo SDK

JS-only changes → no rebuild. Use `eas update` (below).

---

## Submit to the test tracks

### iOS → TestFlight

```bash
eas submit --profile preview --platform ios
```

First run asks for an App Store Connect API key (create it in App Store
Connect → Users and Access → Integrations → App Store Connect API).
Save it; EAS reuses it.

Three rules this section used to omit, each of which has already cost a
build:

- **The profile must be `distribution: "store"`.** An `internal`
  distribution build is an ad-hoc IPA for directly-installed, UDID-
  registered devices; App Store Connect rejects it. `preview` was
  `internal` until 2026-08-10 and is now `store`, so preview builds go
  to TestFlight while still listening on the `preview` channel — which
  is what lets JS-only fixes reach testers by `eas update` afterwards
  instead of by rebuild.
- **TestFlight builds expire 90 days after upload.** Testers lose the
  app whether or not anything changed. Version 1.0.0 builds 1 and 2
  expired this way. A quiet quarter means a rebuild, not an OTA.
- **The build number must exceed every number already uploaded for that
  `version`.** App Store Connect has consumed 1 and 2 at 1.0.0, so the
  next upload needs ≥ 3. `autoIncrement` reads EAS's own remote
  counter, which tracks its builds and not App Store Connect's — it
  stood at 4 on 2026-08-25, so the next build gets 5. Check the number
  it picked rather than assuming the two agree (`eas build:version:get`,
  `eas build:version:set`).

For internal testers (up to 100, added by Apple ID under TestFlight →
Internal Testing) there is **no Beta App Review** — the build is
installable minutes after processing. External testing needs review,
and review needs a live privacy policy URL, which does not exist yet:
the website policy needs its "Dragons App" section first
(`PRE-LAUNCH.md` § Privacy / compliance).

### Android → Play Internal Testing

```bash
eas submit --profile preview --platform android
```

First run needs a Google Play service account JSON (create in Play
Console → Setup → API access). Save it.

---

## Add test users

### iOS

App Store Connect → your app → TestFlight → Internal Testing → add
testers by Apple ID email. Max 100 internal testers. They install
TestFlight, accept the invite, install the build.

### Android

Play Console → your app → Testing → Internal testing → Testers tab →
add a Google Group or individual emails. Copy the opt-in URL, send to
testers. They open the link, accept, install from Play Store.

---

## Publish a JS update (OTA)

After testers have the preview build installed, ship JS-only changes
this way:

```bash
eas update --branch preview --message "fix schedule filter"
```

- Tester opens app → bundle downloads in background.
- On next cold start, the new JS loads.
- Older bundles are cached; rollback by re-publishing a prior version.

For production:

```bash
eas update --branch production --message "v1.0.1 hotfix"
```

### List / inspect / roll back

```bash
eas update:list --branch preview              # recent updates on a branch
eas channel:list                                # channels + current branch binding
eas build:list --limit 10                       # recent builds + channel
eas update:republish --group <updateGroupId>    # roll back by republishing older update
```

---

## When to rebuild vs when to OTA

| Change                                     | Rebuild? | OTA? |
| ------------------------------------------ | -------- | ---- |
| React component / styles / copy            | no       | yes  |
| TypeScript utility, hook, or business rule | no       | yes  |
| New / changed API endpoint call            | no       | yes  |
| New string in an i18n file                 | no       | yes  |
| Image asset (bundled `require` import)     | no       | yes  |
| New `expo-*` package with config plugin    | yes      | no   |
| Changed permission in `app.json`           | yes      | no   |
| Added / removed config plugin              | yes      | no   |
| Bumped `version` in `app.json`             | yes      | no   |
| Bumped Expo SDK / React Native version     | yes      | no   |
| Swapped `EXPO_PUBLIC_*` value in `eas.json` | yes       | no (baked at build)* |

\* `EXPO_PUBLIC_*` used in client code is snapshotted at `eas update` time,
so changing the value in `eas.json` + re-running `eas update --branch
<name>` does push new config to existing builds. Changes to native-side
env (e.g. Sentry DSN in a plugin) need a rebuild.

---

## Daily workflow

```bash
# make JS-only changes
git commit -am "fix X"

# push to testers in ~60s
eas update --branch preview --message "fix X"
```

Then watch tester feedback. If the fix is urgent on production as well:

```bash
eas update --branch production --message "fix X (hotfix)"
```

---

## Bumping `version`

When `app.json > expo.version` changes:

1. Build new binaries for every channel that needs the new version.
2. Resubmit to TestFlight / Play Internal.
3. Testers must install the new build before they can receive further
   updates on that `runtimeVersion`. Updates published to the old
   `version` still reach users still on the old binary — this is how
   versioned rollouts work.

---

## Crash reporting (GlitchTip)

Release-build crashes go to the club's GlitchTip project on the EU
instance — org `hb-dragons`, project `dragons-native`, ingest at
`eu.glitchtip.com`. GlitchTip implements the Sentry ingest API, so the
client is `@sentry/react-native` with the features GlitchTip does not
have (sessions, tracing) switched off in
`src/lib/crash-reporting/options.ts`.

Two EAS environment variables drive it, both set in the `preview` and
`production` environments and **not** in `development`, and neither of
them in the repo:

| Variable | Visibility | What it does |
| --- | --- | --- |
| `EXPO_PUBLIC_GLITCHTIP_DSN` | sensitive | Inlined into the bundle. Without it the SDK is never started, which is what makes a local `pnpm start` and a CI build inert. |
| `SENTRY_AUTH_TOKEN` | secret | Read by sentry-cli inside the native build phase to upload the JS source map. GlitchTip → profile → auth tokens, scope `project:releases`. |

```bash
# Run from apps/native. `--environment` repeats, so one command covers both;
# `development` is deliberately left out. On eas-cli 21+ the command is
# spelled `env:set`; `env:create` is the older name and still works.
eas env:create --name EXPO_PUBLIC_GLITCHTIP_DSN --value "<dsn>" \
  --visibility sensitive --environment preview --environment production

eas env:create --name SENTRY_AUTH_TOKEN --value "<token>" \
  --visibility secret --environment preview --environment production

# Check what landed where:
eas env:list --environment preview
```

Each build profile pins its `environment` explicitly in `eas.json`.
Without that, EAS derives it from the profile's configuration, and
`preview` — which is `distribution: "store"` — would resolve to the
`production` environment and pick up the wrong variables.

Symbolication is by Debug ID: `metro.config.js` builds the config with
`getSentryExpoConfig`, which stamps the same id into the bundle and its
source map, and the `@sentry/react-native/expo` plugin's build phase
uploads the map.

**Use `getSentryExpoConfig`, never `getDefaultConfig` + `withSentryConfig`.**
Both are documented ways to get a Debug ID, but `withSentryConfig`
installs a custom serializer wrapping Metro's, which is the bare
React Native path. Against Expo's serializer it reads `undefined` for
the bundle source and fails the build with `Cannot read properties of
undefined (reading 'match')` — during `expo export:embed`, so on EAS it
surfaces as a bundling failure with no mention of Sentry in the first
few lines. `getSentryExpoConfig` passes a debug-id plugin into Expo's
own `getDefaultConfig` instead and leaves the serializer alone.
Reproduce a bundle locally before spending a cloud build on it:

```bash
pnpm expo export:embed --eager --platform ios --dev false \
  --bundle-output /tmp/main.jsbundle \
  --sourcemap-output /tmp/main.jsbundle.map --assets-dest /tmp
grep -o "debugId=[0-9a-f-]*" /tmp/main.jsbundle   # must match debug_id in the map
``` Release and dist are deliberately not set in
`Sentry.init` — the SDK and sentry-cli each derive them from the native
bundle, and overriding one side is the usual reason a trace arrives
unsymbolicated.

Two paths report, and they are wired differently on purpose. Fatals are
the SDK's: `Sentry.init` installs the `ReactNativeErrorHandlers`
integration, which patches `ErrorUtils`, captures with `handled: false`
and flushes before RCTFatal aborts the process.
`installGlobalErrorHandler` wraps that handler for the `DRAGONS_JS_ERROR`
NSLog line only — capturing there as well filed every crash twice.
Errors a React boundary catches never reach `ErrorUtils`, so
`components/ErrorBoundary.tsx` reports those by hand, tagged
`source: error-boundary`.

What does *not* work, and is accepted: GlitchTip has no native
symbolication, so ObjC/Java frames stay as addresses. Both paths are JS,
which symbolicates fine.

---

## `expo doctor` gates the build

EAS runs `expo doctor` during the build and fails the whole build on a
non-zero exit, so a doctor failure costs a full cloud build. Since #213
CI runs the same 20 checks on every PR (the `native-doctor` job), and
`expo-doctor` is a pinned devDependency rather than an `npx` download,
so the version CI runs is the version you run:

```bash
pnpm --filter @dragons/native check:doctor
```

(It was 19 checks on SDK 55; SDK 57 added one.)

As of #213 all 20 pass, with nothing skipped. The check "Packages match
versions required by installed Expo SDK" slipped to 19/20 once in August
2026, when eight `expo-*` packages fell behind the SDK 57 pins; #231 moved
them back with `npx expo install --fix`. When that happens again, remember
that `pnpm-workspace.yaml` pins `expo-constants` in its `overrides` block —
bump it to the same version, or the duplicate-native-modules check fails
next. Three checks needed structural fixes to reach 20 in the first place:

- **Duplicate native modules.** A native build may contain only one copy
  of a given native module, and pnpm's isolated store produced several.
  They are pinned to one version each by the `overrides` block in
  `pnpm-workspace.yaml` (`react`, `react-native`, `expo-glass-effect`,
  `expo-constants`) — nothing is forced past a constraint it declares.
  Switching pnpm to hoisted linking also fixes this check but breaks
  `apps/site`; the reasoning is recorded in the root `.npmrc`, which is
  where the idea looks tempting.
- **Peer dependencies.** `expo-linking` (peer of `expo-router`) and
  `react-native-worklets` (peer of `react-native-reanimated`) must be
  direct dependencies. On SDK 55 worklets also had to be hand-pinned,
  because `expo install` wanted 0.7.4 while the reanimated version in
  use needed 0.8.x. SDK 57 ships the matching pair (reanimated 4.5.1 +
  worklets 0.10.1), so that deviation is gone and `expo install --fix`
  no longer walks anything back.
- **Packages match versions required by installed Expo SDK.** This check
  used to be switched off wholesale by
  `EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK=1` in the `base` build
  profile, because the project ran several packages ahead of the SDK's
  pins. That was all-or-nothing, and it also hid the expo-\* family
  drifting *behind* the SDK — which is how the app ended up two SDK
  releases back. The env var is gone. The one remaining deliberate
  deviation, `react` (pinned to a single version workspace-wide by
  `overrides`), is named in `expo.install.exclude` in
  `apps/native/package.json`, so the check stays on for everything else
  and a genuinely stale package fails it.

When adding a package that must sit ahead of its SDK pin, add it to
`expo.install.exclude` with a reason — do not reach for the env var.

---

## Troubleshooting

- **Tester doesn't see an update.** Check the app's installed channel
  (`eas build:view <id>`) matches the branch you published to. Check
  `runtimeVersion` (app `version`) matches. Force-quit + reopen the app
  twice (download, then apply).
- **Build fails with "no projectId".** Re-run `eas update:configure`.
- **`eas update` pushes to wrong branch.** Always pass `--branch
  <name>`; don't rely on git-branch auto-detection.
- **Env var didn't update after `eas update`.** Confirm it's an
  `EXPO_PUBLIC_*` var (others require a rebuild). Verify `eas env:list
  --environment preview` shows the expected value.
- **Android install blocked on tester device.** Play Console opt-in
  link must be opened on the same Google account that's signed into the
  Play Store on that device.
- **iOS TestFlight build stuck on "Processing".** Usually Apple
  review queue. Takes 10 min–24 h on first submit.

---

## Commands cheat sheet

```bash
# Auth
eas login
eas whoami

# Build
eas build --profile preview --platform ios
eas build --profile preview --platform android
eas build --profile production --platform all

# Submit
eas submit --profile preview --platform ios
eas submit --profile preview --platform android

# Publish updates
eas update --branch preview --message "..."
eas update --branch production --message "..."

# Inspect
eas build:list --limit 10
eas build:view <buildId>
eas channel:list
eas update:list --branch preview
eas env:list --environment preview

# Rollback
eas update:republish --group <updateGroupId>
```
