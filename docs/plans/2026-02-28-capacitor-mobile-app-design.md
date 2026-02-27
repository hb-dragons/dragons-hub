# Capacitor Mobile App Design

## Goal

Deploy the Dragons admin dashboard and a public-facing schedule/results view to both iOS App Store and Google Play Store using Capacitor as a native shell around the existing Next.js web app.

## Target Audience

- **Club managers/admins** (5-20 people): Full admin dashboard access on mobile
- **Members & parents** (50-200+): View schedules, standings, match results, team info

## Approach: URL-Based Capacitor Shell

Capacitor loads the deployed web app via URL (not static files). This preserves the existing SSR/RSC architecture and cookie-based authentication without changes.

**Key decision:** No `output: "export"` conversion needed. The WebView loads `https://your-domain.com` and behaves like a browser. Server components, middleware, and cookie sessions continue working as-is.

**Trade-off:** Requires internet connectivity. Acceptable for this use case since schedules, standings, and sync data are inherently live.

---

## Monorepo Structure

```
apps/
  web/              # Existing Next.js app (minor changes)
  api/              # Existing Hono API (new endpoints)
  mobile/           # NEW - Capacitor shell project
    capacitor.config.ts
    ios/              # Generated Xcode project
    android/          # Generated Android Studio project
    src/
      plugins/        # Native plugin initialization
      index.ts        # Capacitor boot + biometric check
    resources/
      icon.png        # 1024x1024 source icon
      splash.png      # 2732x2732 source splash
    package.json
packages/
  ui/               # Safe area CSS additions
  db/               # New push_devices table
  shared/           # Unchanged
  sdk/              # Unchanged
```

### Capacitor Configuration

```typescript
// apps/mobile/capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dragons.app',
  appName: 'Dragons',
  server: {
    url: process.env.MOBILE_SERVER_URL || 'http://localhost:3000',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      androidSplashResourceName: 'splash',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  ios: {
    scheme: 'Dragons',
  },
};

export default config;
```

---

## Authentication

**No changes required.** The URL-based approach means WKWebView (iOS) and Android WebView load the actual deployed domain. HTTP-only cookies with `sameSite: "lax"` work identically to a browser visit. The existing better-auth cookie flow (`dragons.session_token`) continues to function.

CORS is not a factor because requests originate from the loaded domain, not a cross-origin source.

---

## Native Features (Apple Guideline 4.2 Compliance)

Three native features satisfy Apple's minimum functionality requirement:

### 1. Push Notifications (Essential)

**Plugin:** `@capacitor/push-notifications`

**Flow:**
1. On first launch, request notification permission
2. On permission grant, receive device token from APNs (iOS) or FCM (Android)
3. Send token to API: `POST /api/devices/register`
4. API stores token in `push_devices` table
5. Sync worker / booking system sends pushes when events occur

**New API endpoints:**
```
POST   /api/devices/register    # { token, platform }
DELETE /api/devices/:token      # Unregister on logout
```

**New database table:**
```sql
CREATE TABLE push_devices (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Push triggers:**
- Match schedule changed (time, venue, date)
- New match result posted
- Booking status changed
- Sync error (admin-only)

**Server-side push delivery:**
- iOS: `@parse/node-apn` or `apns2` library for APNs
- Android: `firebase-admin` SDK for FCM
- New service: `apps/api/src/services/push-notification.service.ts`

### 2. Biometric Lock

**Plugin:** `@capacitor-community/biometric-auth`

**Flow:**
1. Settings screen: toggle "Require Face ID / Touch ID"
2. Preference stored via `@capacitor/preferences`
3. On app resume from background: if enabled, show biometric prompt before revealing content
4. Fallback to device passcode if biometrics unavailable

### 3. Native Splash Screen

**Plugin:** `@capacitor/splash-screen`

- iOS: `LaunchScreen.storyboard` with Dragons branding
- Android: Native splash screen API (Android 12+)
- Assets generated via `npx @capacitor/assets generate`

---

## Web App Changes

### Safe Area CSS

Add to `packages/ui/src/styles/globals.css`:
```css
:root {
  --safe-area-top: env(safe-area-inset-top, 0px);
  --safe-area-bottom: env(safe-area-inset-bottom, 0px);
  --safe-area-left: env(safe-area-inset-left, 0px);
  --safe-area-right: env(safe-area-inset-right, 0px);
}
```

### Viewport Meta Tag

Ensure root layout includes `viewport-fit=cover`:
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

### Mobile-Responsive Navigation

Current header shows 10 links flat. Changes:
- Below `md` breakpoint: hamburger icon that opens a `Sheet` component (already in `@dragons/ui`)
- Sheet contains all nav links in a vertical list
- Above `md`: current horizontal layout unchanged

### Capacitor Context Detection

Utility for conditional UI:
```typescript
export const isCapacitor = typeof window !== 'undefined' &&
  (window as Record<string, unknown>).Capacitor !== undefined;
```

Use cases:
- Show "Enable Notifications" prompt only in Capacitor
- Hide browser-specific elements
- Show biometric settings only in Capacitor

---

## Public-Facing Pages

New routes accessible without admin login:

```
[locale]/
  schedule/        # Upcoming matches, filterable by team
  results/         # Recent match results with scores
  standings/       # League standings tables
  teams/           # Team list with basic info
```

### New Public API Endpoints

```
GET /public/matches?type=upcoming|recent&teamId=<id>
GET /public/standings?leagueId=<id>
GET /public/teams
```

These return the same data as their admin counterparts but without requiring authentication. They only expose data for the configured club (no sensitive admin data).

### App Navigation Structure

```
┌──────────────────────────────────┐
│         Dragons App              │
├──────────────────────────────────┤
│                                  │
│  [Schedule] [Results] [Standings]│  ← Public tabs (no auth)
│  [Teams]                         │
│                                  │
│  [Admin Dashboard →]             │  ← Requires login
│                                  │
└──────────────────────────────────┘
```

Members see public content immediately. Admins tap "Admin Dashboard" to authenticate and access the full admin UI.

---

## Build & Deployment Pipeline

### Development
```bash
# Terminal 1: Start web + API
pnpm dev

# Terminal 2: Run on iOS simulator
cd apps/mobile && npx cap open ios

# Terminal 3: Run on Android emulator
cd apps/mobile && npx cap open android
```

### Production Build
1. Deploy `apps/web` and `apps/api` as usual
2. Update `MOBILE_SERVER_URL` in Capacitor config to production URL
3. Build native apps:
   ```bash
   cd apps/mobile
   npx cap sync
   # iOS: Build in Xcode → Archive → Upload to App Store Connect
   # Android: Build in Android Studio → Generate signed AAB → Upload to Play Console
   ```

### CI/CD (Future)
- GitHub Actions workflow for native builds
- Fastlane for automated App Store / Play Store submissions
- TestFlight for iOS beta distribution
- Google Play internal testing track for Android beta

---

## Changes Summary

| Package | Changes |
|---------|---------|
| `apps/mobile` (NEW) | Capacitor project, native plugins, build config |
| `apps/api` | Push device endpoints, public API endpoints, push notification service |
| `apps/web` | Viewport meta, mobile nav (hamburger menu), Capacitor detection utility, public pages |
| `packages/ui` | Safe area CSS variables in globals.css |
| `packages/db` | `push_devices` schema |
| `packages/shared` | Push notification types/schemas |

## What Does NOT Change

- Authentication system (cookies work in URL-based WebView)
- Next.js output mode (stays `standalone`)
- Server components / SSR
- Existing admin pages
- API middleware
- Database schema (except new `push_devices` table)
