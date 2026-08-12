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

## Current state (as of 2026-08-11)

- Expo SDK 57 (`expo` / `expo-router` 57.0.12, react-native 0.86.2),
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
- EAS account: `eshamounskerto` (personal; migrate before public launch).

**Builds:** four exist, all iOS, all from April 2026 — three on the
`preview` profile and one on `production`. **No Android build has ever
been made.** Two of them reached TestFlight as version 1.0.0 builds 1
and 2; both have since **expired** (see the 90-day rule below), so no
tester currently has an installable binary.

**Updates:** none. No `eas update` has ever been published on any
branch, so `development` and `preview` both show an empty update group,
and there is no `production` channel yet.

**Consequence for the next release:** the April binaries are not just
expired, they are fingerprint-incompatible with today's JS —
`react-native-reanimated` + `react-native-worklets`, gesture-handler,
keyboard-controller, glass-effect, datetimepicker, segmented-control,
haptics, clipboard and device all landed after the last build, and
camera / web-browser were removed. `@gorhom/bottom-sheet` is on neither
list any more: it arrived after that build and left again in #225, once
every sheet had become a native form-sheet route. (An earlier revision
of this line also listed `linking` as removed; it never was — see
`PRE-LAUNCH.md`, expo-router requires it.) On top of that the whole
project moved from SDK 55 to SDK 57 in #213, which is a rebuild on its
own. OTA cannot bridge any of it. Verify before assuming otherwise:

```bash
eas fingerprint:compare --build-id <id>   # from `eas build:list`
```

---

## First-time setup (per machine)

```bash
# Install the EAS CLI globally if you don't have it
npm i -g eas-cli

# Sign in to the EAS account that owns the project
eas login
eas whoami   # should print: eshamounskerto
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
  counter, which tracks its builds and not App Store Connect's — check
  the number it picked rather than assuming the two agree.

For internal testers (up to 100, added by Apple ID under TestFlight →
Internal Testing) there is **no Beta App Review** — the build is
installable minutes after processing. External testing needs review,
and review needs a live privacy policy URL, which `PRE-LAUNCH.md` still
lists as unwritten.

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

As of #213 all 20 pass, with nothing skipped. Three of them needed
structural fixes to get there:

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
