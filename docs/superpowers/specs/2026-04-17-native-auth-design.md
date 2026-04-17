# Native Authentication Design

**Date:** 2026-04-17
**Scope:** Add sign-in and role-gated navigation to the Expo Router native app (`apps/native`). Phase 1 focuses on referee access only. Admin parity is out of scope.

## Goals

- Let a referee (or admin) sign in on mobile and see their assigned games.
- Keep the app public-first: anonymous users retain full access to home, schedule, standings, teams, and detail screens without friction.
- Introduce a clean mental model of two "modes" without building two tab sets: the Referee tab only exists when the signed-in user has the required role.

## Non-goals (v1)

- Sign-up in native (admin-created accounts only; handled in web for now).
- Password reset flow in native.
- Social login / OAuth.
- Accept/decline or any write operations on referee assignments.
- Admin screens on native (future phase).
- Account management (email/password change, delete account).
- Automated tests (`apps/native` has no test harness today; adding one is out of scope).
- Push notifications tied to assignments.
- Calendar sync.

## Current state (reference)

- Expo Router with `(tabs)` group (home / schedule / standings / teams), `(auth)` modal group (sign-in / sign-up), profile route, and detail routes (`team/[id]`, `game/[id]`, `h2h/[teamApiId]`).
- `@better-auth/expo` + `better-auth/react` with `expo-secure-store`, initialised in `apps/native/src/lib/auth-client.ts`.
- Cookie-based API auth via `apps/native/src/lib/api.ts` (pulls cookie from `authClient.getCookie()`).
- Biometric lock hook (`useBiometricLock`) gates the **entire app** at cold start — orthogonal to authentication.
- Backend roles (from `better-auth` admin plugin): `user` (default), `referee`, `admin`. Middleware `requireAdmin` / `requireReferee` lives in `apps/api/src/middleware/auth.ts`.
- Web referee surface (`apps/web/src/app/[locale]/admin/referee/matches/page.tsx`) renders `RefereeGamesList` with paginated `RefereeGameListItem` from `/referee/games`.

## Decisions (from brainstorm)

1. Scope = **referee-first**. Admin comes later.
2. Protected surface = **one dynamic tab**, additive to the public tabs (not a replacement mode).
3. Gating = **conditional trigger** in `(tabs)/_layout.tsx`, driven by `authClient.useSession()`.
4. **No sign-up** on native.
5. **No password recovery** on native in v1.
6. Sign-in reached from the Profile screen.

## Architecture

### Route tree

```
src/app/
├─ _layout.tsx                 # RootLayout: extends splash gate until session resolves
├─ (auth)/
│  ├─ _layout.tsx              # modal stack (unchanged)
│  └─ sign-in.tsx              # cleaned up: no sign-up link, inline errors, password-manager hints
├─ (tabs)/
│  ├─ _layout.tsx              # conditionally mounts Referee trigger
│  ├─ index.tsx                # home (public)
│  ├─ schedule.tsx             # public
│  ├─ standings.tsx            # public
│  ├─ teams.tsx                # public
│  └─ referee.tsx              # NEW — referee assignments list
├─ profile.tsx                 # updated anon copy, role-gated badge
├─ team/[id].tsx               # unchanged
├─ game/[id].tsx               # unchanged
└─ h2h/[teamApiId].tsx         # unchanged
```

**Deleted:** `(auth)/sign-up.tsx`, sign-up i18n keys, the "Don't have an account? Sign up" link on the sign-in screen.

### Session bootstrap

`RootLayout` (`_layout.tsx`) currently holds the splash screen until fonts load and biometric unlock completes. Extend the gate to also wait for `authClient.useSession()` to resolve once:

```tsx
const [fontsLoaded] = useFonts(fontAssets);
const { isLocked, authenticate } = useBiometricLock();
const { isPending: sessionPending } = authClient.useSession();

const ready = fontsLoaded && !sessionPending && !isLocked;
useEffect(() => { if (ready) void SplashScreen.hideAsync(); }, [ready]);
```

This removes the cold-start flicker where a referee sees the public-only tab bar for 1–2 frames before the Referee tab pops in.

Session refresh is handled by better-auth (7-day expiry, daily refresh, 5-min cookie cache) — no extra client code required.

### Tab gating

```tsx
// (tabs)/_layout.tsx
function hasRefereeAccess(role: unknown) {
  return role === "referee" || role === "admin";
}

export default function TabLayout() {
  const { colors } = useTheme();
  const { data: session } = authClient.useSession();
  const canRef = hasRefereeAccess(
    session && "role" in session.user ? session.user.role : undefined,
  );
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!canRef && segments.at(-1) === "referee") router.replace("/");
  }, [canRef, segments, router]);

  return (
    <NativeTabs tintColor={colors.primary}>
      {/* existing public triggers: index, schedule, standings, teams */}
      {canRef ? (
        <NativeTabs.Trigger name="referee">
          <NativeTabs.Trigger.Label>{i18n.t("tabs.referee")}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: "whistle", selected: "whistle.fill" }}
            md="sports"
          />
        </NativeTabs.Trigger>
      ) : null}
    </NativeTabs>
  );
}
```

- The `useEffect` bounce is a deterministic safeguard when signing out from inside the referee tab.
- `role` is added by better-auth's admin plugin (not part of the core `User` type); the `"role" in session.user` guard mirrors the API middleware (`apps/api/src/middleware/auth.ts:13`).
- SF Symbol `whistle` requires iOS 17+. If the project's deployment target is older, fall back to `person.badge.shield.checkmark`.

### Sign-in screen changes (`(auth)/sign-in.tsx`)

- Remove the sign-up link and all navigation to `/(auth)/sign-up`.
- Replace `Alert.alert(...)` failures with an inline error row under the password field using `colors.destructive`. Alerts are too heavy for the common "wrong password" case.
- Disable the submit button when either field is empty (no alert for empty inputs).
- On success: `router.dismissAll()` only. Drop `router.replace("/")`; the caller (profile) is revealed automatically. The visible switch on profile (anon → signed-in card) is the success signal.
- Add iOS password-manager hints: `textContentType="emailAddress"` + `autoComplete="email"` on the email input; `textContentType="password"` + `autoComplete="current-password"` on the password input.
- Add a top-left close (X) button for Android and large-screen reachability; iOS swipe-to-dismiss continues to work.

### Referee tab (`(tabs)/referee.tsx`)

- Data source: `/referee/games` (same endpoint as `apps/web/src/app/[locale]/admin/referee/matches/page.tsx`). Returns `PaginatedResponse<RefereeGameListItem>`.
- Fetched via SWR: `useSWR("referee:games", () => deviceApi.getRefereeGames())`. If `deviceEndpoints` in `@dragons/api-client` doesn't expose `getRefereeGames()`, add it in the same change.
- States:
  - Loading → `<ActivityIndicator>` centered in a `Screen`, matching `(tabs)/index.tsx`.
  - Error → `Card` with `error.message` and a Retry `Pressable` that calls `mutate()`.
  - Empty → centered `refereeTab.empty` text inside a `Screen`.
  - Data → `FlatList` of `MatchCardCompact`, grouped by date with `SectionHeader` for consistency with `(tabs)/schedule.tsx`.
- Row tap navigates to the existing public `game/[id]` detail route.
- Pull-to-refresh wired to `mutate()`.
- No explicit unauthenticated branch — the tab is only mounted when the user has the required role. A 401 mid-session is handled by the API layer (see below).

### Profile changes (`profile.tsx`)

Anonymous state:
- Title copy shifts to staff-framed: `auth.staffSignInPrompt` ("Sign in as referee or admin") + `auth.staffSignInHint` ("Fans don't need an account to use the app.").
- Single primary "Sign in" button opens `/(auth)/sign-in`.
- Theme selector remains visible; biometric lock control is hidden (toggling is meaningful only with a signed-in session to protect).

Signed-in state:
- Render the role badge only when `role ∈ {referee, admin}`. Suppress for bare `user` role so the UI doesn't display a semantically empty badge.
- Biometric lock, theme, sign-out — unchanged.
- No password / email / account-deletion controls in v1.

Biometric lock note: it still gates the entire app at cold start independent of authentication state. This spec does not alter that behavior.

### API client and 401 handling

Today `apiClient` (in `apps/native/src/lib/api.ts`) attaches the better-auth cookie but has no response interceptor. Add one that, on any `401`, clears the client session:

```tsx
export const apiClient = new ApiClient({
  baseUrl,
  auth: { getHeaders: () => { /* existing cookie logic */ } },
  onResponse: async (res) => {
    if (res.status === 401) {
      await authClient.signOut().catch(() => {});
    }
  },
});
```

If `ApiClient` in `@dragons/api-client` doesn't currently expose `onResponse`, add the hook (small, contained change in the shared client). Rationale: a 401 arriving despite better-auth's built-in refresh means the session is genuinely dead. Calling `signOut()` drops the local session, which cascades through `useSession()` → Referee tab unmounts → profile flips to anonymous. The user re-enters credentials via Profile → Sign in.

Explicitly not doing:
- Bespoke retry-with-refresh (better-auth already refreshes on every call via the 5-min cookie cache).
- Global 401 toast (the UI transition is the signal).

### i18n

Add keys (`en.json` and `de.json`):

- `tabs.referee` — "Referee" / "Schiri"
- `refereeTab.title` — "My Assignments" / "Meine Einsätze"
- `refereeTab.empty` — "No upcoming assignments" / "Keine bevorstehenden Einsätze"
- `refereeTab.error` — "Couldn't load assignments" / "Einsätze konnten nicht geladen werden"
- `refereeTab.retry` — "Retry" / "Erneut versuchen"
- `refereeTab.signInAgain` — "Sign in again" / "Erneut anmelden"
- `auth.staffSignInPrompt` — "Sign in as referee or admin" / "Als Schiedsrichter oder Admin anmelden"
- `auth.staffSignInHint` — "Fans don't need an account to use the app." / "Als Fan brauchst du kein Konto."
- `auth.invalidCredentials` — "Invalid email or password" / "Ungültige E-Mail oder Passwort"

Remove keys:

- `auth.signUp`, `auth.signUpFailed`, `auth.noAccount`, `auth.hasAccount`, `auth.name` (and any other sign-up-only copy).

## UX flows

### First launch — fan (anonymous)

1. Splash → fonts + biometric unlock + session resolve (session = null).
2. App opens on Home tab. Tab bar: home / schedule / standings / teams.
3. Profile tab shows "Sign in as referee or admin" with helper text. Fan ignores it.

### First launch — referee, signing in

1. Splash resolves anonymous (no session yet).
2. User opens Profile, taps "Sign in".
3. Modal slides up with the cleaned sign-in screen.
4. User enters email + password, taps Sign In.
5. Success → modal dismisses. Profile reveals signed-in state. Tab bar re-renders with an added Referee tab.
6. User taps Referee tab → assignments list.

### Returning referee (cached session)

1. Splash holds until session resolves (loads from SecureStore cache).
2. Splash hides with Referee tab already visible. No flicker.

### Sign-out

1. User taps Sign Out in profile.
2. `authClient.signOut()` clears session + SecureStore entry.
3. `useSession()` re-emits null → Referee tab disappears from tab bar.
4. If user was standing on the Referee tab when signing out, the `useEffect` in `(tabs)/_layout.tsx` routes them to `/`.
5. Profile flips to anonymous state with "Sign in as referee or admin" CTA.

### Session expiry (7 days, or server-side invalidation)

1. Next protected request returns 401.
2. `onResponse` hook calls `authClient.signOut()`.
3. UI cascade identical to manual sign-out. No toast, no banner in v1.

### Offline cold start

1. `useSession()` resolves from SecureStore cache (instant, no network).
2. App opens. If cached session indicated referee, Referee tab is visible.
3. First request to `/referee/games` fails with a network error → error state with Retry.

## Implementation-time risks

1. **`NativeTabs` conditional children.** `expo-router/unstable-native-tabs` may not handle mounting/unmounting a trigger at runtime cleanly on iOS or Android. If implementation reveals this, fall back to always-mounting the trigger and using a `(protected)` layout redirect inside `referee.tsx` — accept that non-referees briefly see a tab that bounces them to sign-in.
2. **SF Symbol availability.** `whistle` (iOS 17+) — verify the project's iOS deployment target and use `person.badge.shield.checkmark` as a fallback if needed.
3. **`ApiClient.onResponse` hook.** May not exist yet in `@dragons/api-client`; add it as part of this change.
4. **`deviceApi.getRefereeGames()`.** May not be wired in the shared API client; add the thin wrapper if missing.

## Manual test plan

Until a native test harness exists, verify by hand before release:

- [ ] Cold start as anonymous user → home tab; no Referee tab; profile shows staff CTA.
- [ ] Cold start with stored referee session → Referee tab visible on first paint (no flicker).
- [ ] Sign in with valid credentials → modal dismisses, Referee tab appears, profile shows user card.
- [ ] Sign in with wrong password → inline error under password field; submit button re-enables.
- [ ] Sign in with empty fields → submit button disabled.
- [ ] iOS: password manager prompts to save credentials after first successful sign-in.
- [ ] Sign out from profile → Referee tab disappears; profile flips to anonymous state.
- [ ] Sign out while viewing Referee tab → routed to home; Referee tab gone.
- [ ] Simulate 401 on `/referee/games` (e.g. revoke session server-side) → local session clears; tab unmounts.
- [ ] Offline cold start with cached session → app opens; `/referee/games` shows error state with Retry.
- [ ] Referee sees empty state copy when they have no upcoming assignments.
- [ ] Biometric lock enabled + signed in → unlocks to referee view as expected.
- [ ] Biometric lock enabled + signed out → unlocks to anonymous view.
- [ ] German locale: all new strings render in `de`.

## Future work (not in this spec)

- Accept/decline on referee assignments.
- Push notifications on new assignments or changes.
- Password reset in native (email link + deep link handler).
- Admin screens on native.
- `jest-expo` test harness.
- Explicit "Session expired" toast if referees report confusion after silent 401 handling.
- Account management (change email, change password, delete account).
