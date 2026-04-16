# Expo Mobile App MVP — Design Spec

**Date:** 2026-04-16
**Scope:** Public-only MVP for iOS and Android using Expo (React Native)
**Stitch Project:** `projects/6536303684079353503` (Dragons)

## Decision Record

**Chosen approach:** Expo (React Native) — new `apps/native` in the monorepo.

**Rejected alternatives:**
- **Capacitor + static export** — requires converting Next.js to `output: "export"`, losing SSR for web. WebView rendering can't deliver native feel. Existing Capacitor setup in `apps/mobile/` is incomplete (placeholder `dist/`, no build pipeline, `output: "standalone"` incompatible).
- **Capacitor + live server URL** — WebView wrapper around hosted site. Apple rejects "just a WebView" apps. No offline, no native feel.
- **PWA** — no App Store/Play Store presence (hard requirement).

**Why Expo:**
- Native components (not WebView) — native scroll physics, gestures, transitions
- Official Better Auth Expo plugin (`@better-auth/expo`) — direct integration with existing auth
- File-based routing (Expo Router) — familiar pattern from Next.js
- OTA updates via EAS Update — push JS fixes without store review
- Free local builds — no mandatory cloud costs
- First-class pnpm monorepo support (SDK 55)
- All required features covered by Expo SDK: push notifications, biometrics, camera, deep linking

**Costs:**
- Apple Developer Program: $99/year (required)
- Google Play Console: $25 one-time (required)
- EAS cloud builds: optional convenience (free tier: 15 iOS + 15 Android/month; local builds always free)

## Monorepo Structure

```
dragons-all/
├── apps/
│   ├── web/                 # Next.js 16 (unchanged)
│   ├── api/                 # Hono API (unchanged, one new plugin added to auth)
│   ├── native/              # NEW: Expo app (React Native)
│   │   ├── src/
│   │   │   ├── app/         # Expo Router file-based routes
│   │   │   ├── components/  # Native UI components
│   │   │   ├── hooks/       # useAuth, useBiometric, useTheme, etc.
│   │   │   ├── lib/         # Auth client, API helpers
│   │   │   ├── theme/       # Design tokens, typography, colors
│   │   │   └── constants/   # App-specific constants
│   │   ├── assets/          # App icon, splash, bundled images
│   │   ├── app.json         # Expo config (appId, scheme, plugins)
│   │   ├── eas.json         # Build profiles (dev, preview, production)
│   │   ├── metro.config.js  # Metro bundler (auto-configured SDK 55)
│   │   ├── tsconfig.json    # Extends root tsconfig
│   │   └── package.json
│   └── mobile/              # OLD: Capacitor (deprecated, remove later)
├── packages/
│   ├── shared/              # Types, Zod schemas, constants (shared with native)
│   ├── sdk/                 # Federation API types (shared with native)
│   ├── api-client/          # NEW: Typed API fetch wrapper (shared)
│   │   ├── src/
│   │   │   ├── client.ts       # Base ApiClient with pluggable auth
│   │   │   ├── errors.ts       # APIError class
│   │   │   ├── endpoints/
│   │   │   │   ├── public.ts   # Public endpoints (matches, standings, teams)
│   │   │   │   ├── devices.ts  # Device registration
│   │   │   │   └── index.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── db/                  # Server-only (NOT shared)
│   └── ui/                  # Web-only shadcn/Radix (NOT shared)
```

### What Gets Shared

| Package | Content | Consumers |
|---|---|---|
| `@dragons/shared` | Domain types (`MatchListItem`, `LeagueStandings`, etc.), Zod schemas, constants, enums | web, native, api |
| `@dragons/sdk` | Federation SDK types (`SdkLiga`, `SdkSpielplanMatch`, etc.), type guards | web, native, api |
| `@dragons/api-client` | Typed `ApiClient` class, endpoint functions, `APIError` | web, native |

### What Stays Separate

| Package | Reason |
|---|---|
| `@dragons/db` | Server-only (Drizzle, PostgreSQL) |
| `@dragons/ui` | Web-only (Radix, shadcn, React DOM) |

### pnpm Workspace Config

Add `apps/native` and `packages/api-client` to `pnpm-workspace.yaml`. May need `node-linker=hoisted` in `.npmrc` for Metro bundler compatibility (SDK 55 supports isolated installs but hoisted is the safe default).

## Design System: Dragon's Lair for Native

The web design system is defined in `packages/ui/DESIGN-SYSTEM.md` and `packages/ui/src/styles/globals.css`. The native app ports these tokens to a React Native theme object. The same visual language, adapted to native primitives.

### Color Tokens

Ported 1:1 from `globals.css` CSS custom properties:

```typescript
// apps/native/src/theme/colors.ts
export const colors = {
  light: {
    background: '#f8f9fa',
    foreground: '#191c1d',
    card: '#ffffff',
    cardForeground: '#191c1d',
    primary: '#004b23',
    primaryForeground: '#ffffff',
    secondary: '#c8eccb',
    secondaryForeground: '#4c6c51',
    muted: '#edeeef',
    mutedForeground: '#3f4940',
    accent: '#e7e8e9',
    accentForeground: '#191c1d',
    destructive: '#ba1a1a',
    destructiveForeground: '#ffffff',
    heat: '#953d00',
    heatForeground: '#ffffff',
    heatSubtle: '#ffb692',
    brand: '#006631',
    brandForeground: '#8be19f',
    border: '#bfc9bd',
    input: '#f3f4f5',
    ring: '#004b23',
    surfaceLowest: '#ffffff',
    surfaceLow: '#f3f4f5',
    surfaceBase: '#edeeef',
    surfaceHigh: '#e7e8e9',
    surfaceHighest: '#e1e3e4',
    surfaceBright: '#f8f9fa',
  },
  dark: {
    background: '#131313',
    foreground: '#e2e2e2',
    card: '#2a2a2a',
    cardForeground: '#e2e2e2',
    primary: '#84d997',
    primaryForeground: '#003919',
    secondary: '#2a4a30',
    secondaryForeground: '#c8eccb',
    muted: '#1f1f1f',
    mutedForeground: '#bfc9bd',
    accent: '#2a2a2a',
    accentForeground: '#e2e2e2',
    destructive: '#ffb4ab',
    destructiveForeground: '#690005',
    heat: '#ed691f',
    heatForeground: '#4c1a00',
    heatSubtle: '#ffb695',
    brand: '#006631',
    brandForeground: '#8be19f',
    border: '#3f4940',
    input: '#1f1f1f',
    ring: '#84d997',
    surfaceLowest: '#0e0e0e',
    surfaceLow: '#1b1b1b',
    surfaceBase: '#1f1f1f',
    surfaceHigh: '#2a2a2a',
    surfaceHighest: '#353535',
    surfaceBright: '#393939',
  },
} as const;
```

### Typography

Bundle Space Grotesk and Inter via `expo-font`. Map to the same semantic roles as the web:

```typescript
// apps/native/src/theme/typography.ts
export const typography = {
  display: {
    fontFamily: 'SpaceGrotesk-Bold',
    // Used for: page titles, KPI values, section headings
    // Web equivalent: font-display
  },
  displayMedium: {
    fontFamily: 'SpaceGrotesk-Medium',
    // Used for: table headers, badge text, small captions
  },
  body: {
    fontFamily: 'Inter-Regular',
    // Used for: paragraphs, table cells, form labels
  },
  bodyMedium: {
    fontFamily: 'Inter-Medium',
    // Used for: emphasized body text
  },
  bodySemiBold: {
    fontFamily: 'Inter-SemiBold',
    // Used for: match scores, stat values
  },
} as const;
```

### Spacing and Radius

```typescript
// apps/native/src/theme/spacing.ts
export const radius = {
  md: 4,      // 0.25rem — cards, buttons, inputs (matches web rounded-md)
  pill: 9999, // badges, filter chips (matches web rounded-4xl)
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;
```

### Design Rules (Ported from Web)

These rules from `DESIGN-SYSTEM.md` apply identically to native:

1. **No-Line Rule** — never use `borderWidth: 1` for content sectioning. Define hierarchy through `backgroundColor` shifts using the surface tier tokens.
2. **Sharp corners** — `borderRadius: 4` (radius.md) on all components. Only exception: badges and filter pills use `borderRadius: 9999` (radius.pill).
3. **Heat for urgency** — use `heat` tokens for live indicators, countdown badges, action CTAs. Never use `secondary` for orange.
4. **Secondary is sage green** — informational badges, secondary buttons. Not orange.
5. **Accent is neutral** — a surface tonal shift for interactive states (press/focus), not a brand color.
6. **Tonal surface layering** — cards float on `surfaceLowest`, sections use `surfaceLow`, hover/press states use `surfaceHigh`. No drop shadows on cards.
7. **Display font for headings** — Space Grotesk (bold/uppercase) for all screen titles, section headings, stat values.
8. **Body font for data** — Inter for all body text, table cells, form content.

### Theme Hook

```typescript
// apps/native/src/hooks/useTheme.ts
// Wraps React Native's useColorScheme() with Dragon's Lair tokens.
// Returns typed color object for current mode.
// Supports manual override stored in SecureStore (like web's next-themes).

export function useTheme() {
  // Returns: { colors, typography, spacing, radius, isDark, setTheme }
}
```

### Core Native Components

Reusable primitives that enforce the design system. Every screen composes from these:

| Component | Purpose | Design System Enforcement |
|---|---|---|
| `Card` | Container with tonal lift | `backgroundColor: surfaceLowest`, `borderRadius: radius.md`, no border |
| `Badge` | Status/category indicator | Pill shape (`radius.pill`), `displayMedium` font, uppercase |
| `FilterPill` | Toggleable filter | Pill shape, `surfaceHigh` active state, `displayMedium` font |
| `MatchCard` | Single match display | Date, time, teams, venue tag, own-club highlight with `primary` accent |
| `StandingsRow` | Table row | Own-club row gets `primary/5` background tint + left border accent |
| `TeamCard` | Team in grid | Hero image area, team name in `display` font, league subtitle |
| `SectionHeader` | Section title | `display` font, uppercase, `mutedForeground` subtitle below |
| `StatStrip` | Bottom stat row | Horizontal row of stat items, `surfaceLow` background |
| `IconButton` | Header actions | Transparent background, `foreground` icon color |
| `Screen` | Base screen wrapper | `backgroundColor: background`, safe area insets, scroll handling |

These components are the **extensible foundation** — admin screens in later phases compose the same primitives with additional complexity (forms, tables, modals).

## Navigation Structure

```
apps/native/src/app/
├── _layout.tsx                     # Root: SessionProvider, ThemeProvider, font loading
├── (auth)/
│   ├── _layout.tsx                 # Stack navigator (no tabs)
│   ├── sign-in.tsx                 # Email/password + biometric option
│   └── sign-up.tsx                 # Registration form
├── (tabs)/
│   ├── _layout.tsx                 # Tab bar config: 4 tabs with icons
│   ├── index.tsx                   # HOME — next game, last result, nav cards
│   ├── schedule.tsx                # SCHEDULE — filter pills, match list by date
│   ├── standings.tsx               # TABLES — league standings with own-team highlight
│   └── teams.tsx                   # TEAMS — senior/jugend sections, team cards
├── team/[id].tsx                   # Team detail — hero, last/next game, schedule
├── game/[id].tsx                   # Game detail — deep link target, full match info
└── profile.tsx                     # Profile — user info, biometric toggle, theme, sign out
```

### Route Protection

Auth is **optional** for MVP. All tab screens are public. Auth unlocks:
- Push notification registration (needs user identity for device token)
- Profile screen (biometric lock, theme preference)

```tsx
// _layout.tsx
<Stack>
  {/* Public — always accessible */}
  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
  <Stack.Screen name="team/[id]" />
  <Stack.Screen name="game/[id]" />

  {/* Auth screens — shown when not logged in and user navigates to profile */}
  <Stack.Screen name="(auth)" options={{ presentation: 'modal' }} />

  {/* Profile — accessible when logged in, redirects to auth if not */}
  <Stack.Screen name="profile" />
</Stack>
```

### Tab Bar

4 tabs matching the Stitch mockups:

| Tab | Icon | Label | Screen |
|---|---|---|---|
| Home | `house` | HOME | Next game + last result + nav cards |
| Schedule | `calendar` | SCHEDULE | Match list with filters |
| Tables | `trophy` | TABLES | League standings |
| Teams | `users` | TEAMS | Team grid |

Tab bar styling: `surfaceLow` background, `primary` active tint, `mutedForeground` inactive tint, `displayMedium` font for labels.

### Header

Top bar on all screens: "HANOVER DRAGONS" in `display` font (uppercase) with club logo left, user avatar icon right (navigates to profile or auth modal).

## Screen Specifications

### Home

**Stitch reference:** "Home (Dark - Simplified)", "Home (Light)"

**Sections (top to bottom):**
1. **Next Game Card** — `Card` with VS layout: home team logo + name, "VS", guest team logo + name. Date, time, venue below. If game is within 2 hours: `Badge` with "LIVE IN {time}" using `heat` color.
2. **Last Result Card** — `Card` with score display (large `display` font), team names, final score.
3. **Navigation Cards** — 2-column grid: Schedule, Standings, Teams. Each is a `Card` with icon + title, navigates to respective tab.
4. **Stat Strip** — horizontal row at bottom: league position, total wins, points for. Uses `StatStrip` component.

**Data:** Two API calls (next match, last result) via `@dragons/api-client` public endpoints.

### Schedule

**Stitch reference:** "Schedule (Dark - Simplified)", "Schedule (Light)"

**Sections:**
1. **Header** — "NEXT BATTLE" / "SPIELPLAN" in `display` font, season subtitle.
2. **Filter Pills** — horizontal scroll: "ALL GAMES", "HOME ONLY", "AWAY". Uses `FilterPill` components.
3. **Match List** — `SectionList` grouped by date. Each section header shows date. Each item is a `MatchCard`: time, home team, guest team, venue tag (HOME/AWAY badge), "DETAILS" link.
4. **Load More** — "LOAD NEXT GAMES" button at bottom.

**Data:** `GET /public/matches` with date range and optional home/away filter.

### Standings

**Stitch reference:** "Standings (Dark - Simplified)"

**Sections:**
1. **Header** — "LEAGUE STANDINGS" in `display` font, "REGULAR SEASON" badge, descriptive subtitle.
2. **Standings Table** — for each tracked league: table with columns Pos, Team (logo + name), W, L, PTS. Own-club row highlighted with `primary/5` background tint and left border accent (`primary/50`).
3. **Bottom Cards** — "Season Tickets" CTA (if applicable), "Dragons Stats" link. These are optional for MVP — can be empty-state cards or omitted.

**Data:** `GET /public/standings` returns `LeagueStandings[]` grouped by league.

### Teams

**Stitch reference:** "Teams (Mannschaften)"

**Sections:**
1. **Header** — "OUR TEAMS" in `display` font, subtitle.
2. **Senior Teams** — section header "SENIOR TEAMS". Featured team as large hero `TeamCard` (full width). Remaining senior teams in 2-column grid of `TeamCard` components.
3. **Youth Teams** — section header "JUGEND". 2-column grid.
4. **Venue Card** — "THE DRAGON'S LAIR" — venue name, address. Optional for MVP.

**Data:** `GET /public/teams`, split by age group / league level. `isOwnClub` flag determines which teams to show.

### Team Detail

**Stitch reference:** "Team Detail (Damen 1)"

**Sections:**
1. **Hero** — large team name in `display` font ("DAMEN 1"), league name, position info.
2. **Last Game** — score card with `display` font score.
3. **Next Game** — VS layout card.
4. **Upcoming Schedule** — list of `MatchCard` components for this team's remaining matches.
5. **Coaching Staff** — optional for MVP (no API endpoint for staff data).

**Data:** `GET /public/matches?teamApiId={id}` + `GET /public/standings` (for league position).

### Game Detail (Deep Link Target)

**Route:** `game/[id]` — linked from push notifications and universal links.

**Sections:**
1. **Header** — league name, match day.
2. **Score/VS** — if played: large score display. If upcoming: VS layout with date/time.
3. **Venue** — venue name, city.
4. **Match Info** — status (confirmed/cancelled/forfeited), match number.

**Data:** `GET /public/matches` filtered to specific match.

### Sign In (Modal)

**Sections:**
1. **Dragons Logo** — centered, brand treatment.
2. **Email Input** — `input` background, `border/20` ghost border, `radius.md`.
3. **Password Input** — same styling.
4. **Sign In Button** — `primary` background, `primaryForeground` text, `radius.md`.
5. **Sign Up Link** — navigates to sign-up screen.
6. **Biometric Option** — if returning user with biometric enabled: Face ID / fingerprint button.

**Auth:** `authClient.signIn.email({ email, password })` via `@better-auth/expo`.

### Profile

**Sections:**
1. **User Info** — name, email, role badge.
2. **Biometric Lock** — toggle switch. When enabled, app requires Face ID / fingerprint on launch. Stored via `expo-secure-store` Preferences.
3. **Theme** — toggle: System / Light / Dark. Stored locally.
4. **Sign Out** — destructive button. Calls `authClient.signOut()`.

## Authentication

### Server Side (apps/api)

Add the Expo plugin to existing Better Auth config:

```typescript
// apps/api/src/config/auth.ts — add to plugins array
import { expo } from "@better-auth/expo";

plugins: [
  adminClient({ defaultRole: "user", adminRoles: ["admin"] }),
  expo(),  // <-- add this
],

// Add to trustedOrigins
trustedOrigins: [
  "dragons://",      // production deep link scheme
  "dragons://*",
  "exp://*",         // Expo Go development (dev only)
],
```

### Client Side (apps/native)

```typescript
// apps/native/src/lib/auth-client.ts
import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";

export const authClient = createAuthClient({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  plugins: [
    expoClient({
      scheme: "dragons",
      storagePrefix: "dragons",
      storage: SecureStore,
    }),
  ],
});
```

Session tokens stored in iOS Keychain / Android Keystore via SecureStore. The `authClient` automatically attaches auth cookies to API requests via `authClient.getCookie()`.

## API Client Package

### Architecture

```typescript
// packages/api-client/src/client.ts
export interface AuthStrategy {
  getHeaders(): Record<string, string> | Promise<Record<string, string>>;
}

export class ApiClient {
  constructor(
    private baseUrl: string,
    private auth?: AuthStrategy,
  ) {}

  async get<T>(endpoint: string, params?: Record<string, string>): Promise<T>;
  async post<T>(endpoint: string, body?: unknown): Promise<T>;
  async patch<T>(endpoint: string, body?: unknown): Promise<T>;
  async delete<T>(endpoint: string): Promise<T>;
}

// packages/api-client/src/errors.ts
export class APIError extends Error {
  constructor(
    public status: number,
    public code: string,
    public message: string,
  ) { super(message); }
}
```

### Endpoint Functions (MVP Scope)

```typescript
// packages/api-client/src/endpoints/public.ts
export function publicEndpoints(client: ApiClient) {
  return {
    getMatches(params?: { limit?: number; offset?: number; dateFrom?: string; dateTo?: string; hasScore?: boolean; sort?: string; teamApiId?: number }) {
      return client.get<PaginatedResponse<MatchListItem>>('/public/matches', params);
    },
    getStandings() {
      return client.get<LeagueStandings[]>('/public/standings');
    },
    getTeams() {
      return client.get<Team[]>('/public/teams');
    },
  };
}

// packages/api-client/src/endpoints/devices.ts
export function deviceEndpoints(client: ApiClient) {
  return {
    register(token: string, platform: 'ios' | 'android') {
      return client.post('/api/devices/register', { token, platform });
    },
    unregister(token: string) {
      return client.delete(`/api/devices/${token}`);
    },
  };
}
```

### Web Migration

Refactor `apps/web/src/lib/api.ts` to use `@dragons/api-client` internally:

```typescript
// apps/web/src/lib/api.ts — refactored
import { ApiClient } from '@dragons/api-client';

const webClient = new ApiClient(API_URL, {
  getHeaders: () => ({ /* cookie forwarding for client-side */ }),
});

// Server-side keeps cookie forwarding via Next.js cookies()
// Client-side uses credentials: 'include' (existing behavior)
```

This is a non-breaking refactor — web behavior stays identical, just the implementation source moves to the shared package. **This web migration is deferred** — not required for MVP. The native app uses `@dragons/api-client` directly; the web can migrate later.

## Push Notifications

### Setup

Uses `expo-notifications` with Expo Push Service (wraps APNs + FCM).

**Flow:**
1. App requests notification permission on first launch (or deferred to profile)
2. If granted, get Expo push token via `expo-notifications` (`getExpoPushTokenAsync()`)
3. Send token to `POST /api/devices/register` with platform identifier
4. Server stores token in `push_devices` table (already exists)
5. Backend sends notifications via Expo Push Service API

**Server-side change required:** The existing push implementation may send directly to FCM/APNs. Expo push tokens have the format `ExponentPushToken[xxxx]` and must be sent via the Expo Push API (`https://exp.host/--/api/v2/push/send`). The device registration endpoint already accepts tokens — the sending logic needs to detect Expo tokens and route through Expo's push service instead of direct FCM/APNs.

### Deep Link Handling

Push notification payload includes a URL. On tap, Expo Router navigates to the corresponding screen:

```typescript
// Notification data: { url: "/game/123" }
// Expo Router handles: router.push(notification.data.url)
```

## Biometric Authentication

Uses `expo-local-authentication` (Face ID on iOS, fingerprint on Android).

**Flow:**
1. User enables biometric lock in Profile (toggle)
2. Preference stored via `expo-secure-store`: `biometric_lock_enabled = true`
3. On app launch, if enabled: prompt biometric before showing content
4. Falls back to device PIN/passcode if biometric fails

This mirrors the existing Capacitor implementation in `apps/mobile/src/index.ts`.

## Deep Linking / Universal Links

### Configuration

```json
// app.json
{
  "expo": {
    "scheme": "dragons",
    "ios": {
      "associatedDomains": ["applinks:app.hbdragons.de"]
    },
    "android": {
      "intentFilters": [{
        "action": "VIEW",
        "autoVerify": true,
        "data": { "scheme": "https", "host": "app.hbdragons.de" }
      }]
    }
  }
}
```

### Supported Deep Links

| URL Pattern | Native Route | Screen |
|---|---|---|
| `dragons://game/{id}` | `game/[id]` | Game detail |
| `dragons://team/{id}` | `team/[id]` | Team detail |
| `dragons://schedule` | `(tabs)/schedule` | Schedule |
| `dragons://standings` | `(tabs)/standings` | Standings |
| `https://app.hbdragons.de/game/{id}` | `game/[id]` | Universal link |

## Build & Deploy Pipeline

### Expo Config

```json
// apps/native/app.json
{
  "expo": {
    "name": "Dragons",
    "slug": "dragons",
    "scheme": "dragons",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "splash": { "image": "./assets/splash.png", "backgroundColor": "#131313" },
    "ios": {
      "bundleIdentifier": "com.dragons.app",
      "supportsTablet": true
    },
    "android": {
      "package": "com.dragons.app",
      "adaptiveIcon": { "foregroundImage": "./assets/adaptive-icon.png", "backgroundColor": "#131313" }
    },
    "plugins": [
      "expo-router",
      "expo-font",
      "expo-secure-store",
      "expo-local-authentication",
      ["expo-camera", { "cameraPermission": "Allow Dragons to access your camera for team photos." }],
      ["expo-notifications", { "icon": "./assets/notification-icon.png", "color": "#004b23" }]
    ]
  }
}
```

### EAS Build Profiles

```json
// apps/native/eas.json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "ios": { "simulator": false }
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {
      "ios": { "ascAppId": "<app-store-connect-id>" },
      "android": { "track": "internal" }
    }
  }
}
```

### Build Commands

```bash
# Development
pnpm --filter @dragons/native start           # Metro bundler
pnpm --filter @dragons/native ios              # iOS simulator
pnpm --filter @dragons/native android          # Android emulator

# Build locally (free)
eas build --local --platform ios --profile preview
eas build --local --platform android --profile preview

# Build in cloud
eas build --platform all --profile production

# Submit to stores
eas submit --platform all --profile production

# OTA update (JS-only changes, no store review)
eas update --channel production --message "description"
```

## Internationalization

The web app uses `next-intl` with `de` and `en` locales. The native app uses `expo-localization` for locale detection + `i18n-js` for string resolution. Chosen over `react-i18next` because `i18n-js` is lighter and sufficient for this scope.

Translation files live in `apps/native/src/i18n/` (`de.json`, `en.json`) and mirror the web's key structure where applicable. For MVP, support `de` and `en` — detect device locale via `expo-localization`, fall back to `de`.

## Extensibility: Path to Admin (Phase 2)

The design system and component library are built to extend. Phase 2 (admin features) adds:

- `(admin)/` route group with protected stack navigator
- `DataList` component — native equivalent of web's DataTable (FlatList with sort/filter)
- `Sheet` component — bottom sheet for detail views and editing (like web's sheet-based editing)
- `Form` components — native inputs using `input` background, `border/20` ghost border, `radius.md`
- Role-based tab injection — admin users get a 5th "Admin" tab or a separate navigation drawer

All built on the same `Card`, `Badge`, `SectionHeader`, `Screen` primitives from MVP. No architectural changes needed.

## Environment Variables

```bash
# apps/native/.env
EXPO_PUBLIC_API_URL=https://api.hbdragons.de    # Production API
# EXPO_PUBLIC_API_URL=http://192.168.x.x:3001   # Local development
```

## Tech Stack Summary

| Dependency | Version | Purpose |
|---|---|---|
| `expo` | SDK 55 | Framework |
| `expo-router` | v4 | File-based navigation |
| `react-native` | 0.83 | Native runtime |
| `react` | 19.2 | UI library (same as web) |
| `better-auth` | 1.6+ | Auth client |
| `@better-auth/expo` | latest | Expo auth plugin |
| `expo-secure-store` | SDK 55 | Encrypted token storage |
| `expo-notifications` | SDK 55 | Push notifications |
| `expo-local-authentication` | SDK 55 | Biometrics |
| `expo-camera` | SDK 55 | Photo capture (used later for team photos) |
| `expo-font` | SDK 55 | Space Grotesk + Inter loading |
| `expo-localization` | SDK 55 | Locale detection |
| `swr` | 2.4 | Client-side data fetching (same as web) |
| `@dragons/shared` | workspace | Domain types, schemas, constants |
| `@dragons/sdk` | workspace | Federation types |
| `@dragons/api-client` | workspace | Typed API client |
