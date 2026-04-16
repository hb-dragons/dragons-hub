# Expo Mobile App MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public-only mobile app for iOS and Android using Expo, sharing types and API client with the existing Next.js + Hono monorepo.

**Architecture:** New `apps/native` Expo project and `packages/api-client` shared package in the existing pnpm monorepo. Dragon's Lair design system tokens ported from CSS custom properties to React Native theme objects. File-based navigation via Expo Router with 4-tab layout. Better Auth Expo plugin for authentication with SecureStore token storage.

**Tech Stack:** Expo SDK 55, React Native 0.83, Expo Router v4, Better Auth with `@better-auth/expo`, SWR for data fetching, `expo-font` (Space Grotesk + Inter), `expo-secure-store`, `expo-notifications`, `expo-local-authentication`, `i18n-js` + `expo-localization`.

**Spec:** `docs/superpowers/specs/2026-04-16-expo-mobile-app-mvp-design.md`

---

## File Structure

### New Package: `packages/api-client/`

| File | Responsibility |
|---|---|
| `package.json` | Package config, dependencies (zod, @dragons/shared) |
| `tsconfig.json` | TypeScript config extending root |
| `src/client.ts` | `ApiClient` class with pluggable auth strategy |
| `src/errors.ts` | `APIError` class |
| `src/query-string.ts` | Query string builder utility |
| `src/endpoints/public.ts` | Typed public endpoint functions (matches, standings, teams) |
| `src/endpoints/devices.ts` | Device token registration endpoints |
| `src/endpoints/index.ts` | Re-exports |
| `src/index.ts` | Package entry point |
| `src/client.test.ts` | ApiClient unit tests |
| `src/endpoints/public.test.ts` | Public endpoint tests |

### New App: `apps/native/`

| File | Responsibility |
|---|---|
| `package.json` | Expo app config, dependencies |
| `tsconfig.json` | TypeScript config for React Native |
| `app.json` | Expo app manifest (appId, scheme, plugins) |
| `eas.json` | EAS Build profiles |
| `metro.config.js` | Metro bundler config (SDK 55 auto-detection) |
| `src/theme/colors.ts` | Light/dark color tokens from Dragon's Lair |
| `src/theme/typography.ts` | Font family definitions |
| `src/theme/spacing.ts` | Spacing scale and radius tokens |
| `src/theme/index.ts` | Theme re-exports |
| `src/hooks/useTheme.ts` | Theme hook (color scheme + manual override) |
| `src/hooks/useApi.ts` | API client hook with auth integration |
| `src/lib/auth-client.ts` | Better Auth Expo client |
| `src/lib/api.ts` | ApiClient instance for native |
| `src/lib/i18n.ts` | i18n setup with expo-localization |
| `src/i18n/de.json` | German translations |
| `src/i18n/en.json` | English translations |
| `src/components/Screen.tsx` | Base screen wrapper (safe area, background, scroll) |
| `src/components/Card.tsx` | Tonal card container |
| `src/components/Badge.tsx` | Pill-shaped status badge |
| `src/components/FilterPill.tsx` | Toggleable filter chip |
| `src/components/MatchCard.tsx` | Match display with teams, time, venue |
| `src/components/StandingsRow.tsx` | Standings table row with own-club highlight |
| `src/components/TeamCard.tsx` | Team card for grid display |
| `src/components/SectionHeader.tsx` | Section title with subtitle |
| `src/components/StatStrip.tsx` | Horizontal stat row |
| `src/components/Header.tsx` | App header bar with logo and avatar |
| `src/app/_layout.tsx` | Root layout (providers, fonts) |
| `src/app/(tabs)/_layout.tsx` | Tab bar configuration |
| `src/app/(tabs)/index.tsx` | Home screen |
| `src/app/(tabs)/schedule.tsx` | Schedule screen |
| `src/app/(tabs)/standings.tsx` | Standings screen |
| `src/app/(tabs)/teams.tsx` | Teams screen |
| `src/app/team/[id].tsx` | Team detail screen |
| `src/app/game/[id].tsx` | Game detail screen |
| `src/app/(auth)/_layout.tsx` | Auth stack layout |
| `src/app/(auth)/sign-in.tsx` | Sign-in screen |
| `src/app/(auth)/sign-up.tsx` | Sign-up screen |
| `src/app/profile.tsx` | Profile screen |

### Modified Files

| File | Change |
|---|---|
| `pnpm-workspace.yaml` | Already includes `apps/*` and `packages/*` — no change needed |
| `.npmrc` | Create with `node-linker=hoisted` for Metro compatibility |
| `turbo.json` | Add native-specific task config |
| `apps/api/src/config/auth.ts` | Add `expo()` plugin |
| `apps/api/src/config/env.ts` | Add `EXPO_PROJECT_ID` env var (optional) |
| `apps/api/package.json` | Add `@better-auth/expo` dependency |

---

## Task 1: Create `packages/api-client` Package

**Files:**
- Create: `packages/api-client/package.json`
- Create: `packages/api-client/tsconfig.json`
- Create: `packages/api-client/src/errors.ts`
- Create: `packages/api-client/src/query-string.ts`
- Create: `packages/api-client/src/client.ts`
- Create: `packages/api-client/src/endpoints/public.ts`
- Create: `packages/api-client/src/endpoints/devices.ts`
- Create: `packages/api-client/src/endpoints/index.ts`
- Create: `packages/api-client/src/index.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@dragons/api-client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@dragons/shared": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^6.0.2",
    "vitest": "^4.1.4"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write errors.ts**

```typescript
// packages/api-client/src/errors.ts
export class APIError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "APIError";
    this.status = status;
    this.code = code;
  }
}
```

- [ ] **Step 4: Write query-string.ts**

```typescript
// packages/api-client/src/query-string.ts
export function buildQueryString(
  params?: Record<string, string | number | boolean | undefined>,
): string {
  if (!params) return "";
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return entries.length > 0 ? `?${entries.join("&")}` : "";
}
```

- [ ] **Step 5: Write client.ts**

```typescript
// packages/api-client/src/client.ts
import { APIError } from "./errors";
import { buildQueryString } from "./query-string";

export interface AuthStrategy {
  getHeaders(): Record<string, string> | Promise<Record<string, string>>;
}

export interface ApiClientOptions {
  baseUrl: string;
  auth?: AuthStrategy;
  fetchFn?: typeof fetch;
}

export class ApiClient {
  private baseUrl: string;
  private auth?: AuthStrategy;
  private fetchFn: typeof fetch;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl;
    this.auth = options.auth;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async request<T>(
    method: string,
    endpoint: string,
    options?: {
      params?: Record<string, string | number | boolean | undefined>;
      body?: unknown;
      headers?: Record<string, string>;
    },
  ): Promise<T> {
    const qs = buildQueryString(options?.params);
    const url = `${this.baseUrl}${endpoint}${qs}`;

    const authHeaders = this.auth ? await this.auth.getHeaders() : {};

    const res = await this.fetchFn(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...options?.headers,
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new APIError(
        res.status,
        body.code || "UNKNOWN_ERROR",
        body.message || body.error || res.statusText,
      );
    }

    return res.json() as Promise<T>;
  }

  get<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    return this.request<T>("GET", endpoint, { params });
  }

  post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", endpoint, { body });
  }

  patch<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", endpoint, { body });
  }

  delete<T>(endpoint: string): Promise<T> {
    return this.request<T>("DELETE", endpoint);
  }
}
```

- [ ] **Step 6: Write public endpoints**

```typescript
// packages/api-client/src/endpoints/public.ts
import type { ApiClient } from "../client";
import type { MatchListItem, LeagueStandings } from "@dragons/shared";

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface MatchQueryParams {
  limit?: number;
  offset?: number;
  dateFrom?: string;
  dateTo?: string;
  hasScore?: boolean;
  sort?: string;
  teamApiId?: number;
}

// Team type mirrors the public API response
export interface PublicTeam {
  id: number;
  name: string;
  shortName: string | null;
  customName: string | null;
  isOwnClub: boolean;
  leagueName: string | null;
  seasonTeamId: number | null;
  apiTeamPermanentId: number | null;
  badgeColor: string | null;
}

export function publicEndpoints(client: ApiClient) {
  return {
    getMatches(params?: MatchQueryParams) {
      return client.get<PaginatedResponse<MatchListItem>>(
        "/public/matches",
        params as Record<string, string | number | boolean | undefined>,
      );
    },
    getStandings() {
      return client.get<LeagueStandings[]>("/public/standings");
    },
    getTeams() {
      return client.get<PublicTeam[]>("/public/teams");
    },
  };
}
```

- [ ] **Step 7: Write device endpoints**

```typescript
// packages/api-client/src/endpoints/devices.ts
import type { ApiClient } from "../client";

export function deviceEndpoints(client: ApiClient) {
  return {
    register(token: string, platform: "ios" | "android") {
      return client.post<{ success: boolean }>("/api/devices/register", {
        token,
        platform,
      });
    },
    unregister(token: string) {
      return client.delete<{ success: boolean }>(`/api/devices/${token}`);
    },
  };
}
```

- [ ] **Step 8: Write endpoint and package index files**

```typescript
// packages/api-client/src/endpoints/index.ts
export { publicEndpoints } from "./public";
export type { MatchQueryParams, PaginatedResponse, PublicTeam } from "./public";
export { deviceEndpoints } from "./devices";
```

```typescript
// packages/api-client/src/index.ts
export { ApiClient } from "./client";
export type { AuthStrategy, ApiClientOptions } from "./client";
export { APIError } from "./errors";
export { buildQueryString } from "./query-string";
export { publicEndpoints, deviceEndpoints } from "./endpoints";
export type { MatchQueryParams, PaginatedResponse, PublicTeam } from "./endpoints";
```

- [ ] **Step 9: Install dependencies and verify typecheck**

Run: `cd /Users/jn/git/dragons-all && pnpm install && pnpm --filter @dragons/api-client typecheck`
Expected: Clean typecheck with no errors.

- [ ] **Step 10: Commit**

```bash
git add packages/api-client/
git commit -m "feat: add @dragons/api-client shared package

Typed API client with pluggable auth strategy. Includes public endpoints
(matches, standings, teams) and device registration endpoints. Shared
between web and native apps."
```

---

## Task 2: Add API Client Tests

**Files:**
- Create: `packages/api-client/src/query-string.test.ts`
- Create: `packages/api-client/src/client.test.ts`
- Create: `packages/api-client/src/endpoints/public.test.ts`
- Create: `packages/api-client/vitest.config.ts`

- [ ] **Step 1: Create vitest config**

```typescript
// packages/api-client/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
  },
});
```

- [ ] **Step 2: Write query-string tests**

```typescript
// packages/api-client/src/query-string.test.ts
import { describe, it, expect } from "vitest";
import { buildQueryString } from "./query-string";

describe("buildQueryString", () => {
  it("returns empty string for undefined params", () => {
    expect(buildQueryString()).toBe("");
  });

  it("returns empty string for empty object", () => {
    expect(buildQueryString({})).toBe("");
  });

  it("builds query string from params", () => {
    expect(buildQueryString({ limit: 10, offset: 0 })).toBe(
      "?limit=10&offset=0",
    );
  });

  it("filters out undefined values", () => {
    expect(
      buildQueryString({ limit: 10, offset: undefined, sort: "desc" }),
    ).toBe("?limit=10&sort=desc");
  });

  it("encodes special characters", () => {
    expect(buildQueryString({ q: "hello world" })).toBe("?q=hello%20world");
  });

  it("handles boolean values", () => {
    expect(buildQueryString({ hasScore: true })).toBe("?hasScore=true");
  });
});
```

- [ ] **Step 3: Write client tests**

```typescript
// packages/api-client/src/client.test.ts
import { describe, it, expect, vi } from "vitest";
import { ApiClient } from "./client";
import { APIError } from "./errors";

function mockFetch(
  status: number,
  body: unknown,
  ok = status >= 200 && status < 300,
): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

describe("ApiClient", () => {
  it("makes GET requests with params", async () => {
    const fetchFn = mockFetch(200, { data: [] });
    const client = new ApiClient({ baseUrl: "http://api.test", fetchFn });

    await client.get("/matches", { limit: 10 });

    expect(fetchFn).toHaveBeenCalledWith(
      "http://api.test/matches?limit=10",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("makes POST requests with body", async () => {
    const fetchFn = mockFetch(200, { success: true });
    const client = new ApiClient({ baseUrl: "http://api.test", fetchFn });

    await client.post("/register", { token: "abc" });

    expect(fetchFn).toHaveBeenCalledWith(
      "http://api.test/register",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: "abc" }),
      }),
    );
  });

  it("includes auth headers when strategy provided", async () => {
    const fetchFn = mockFetch(200, {});
    const client = new ApiClient({
      baseUrl: "http://api.test",
      fetchFn,
      auth: { getHeaders: () => ({ Cookie: "session=abc" }) },
    });

    await client.get("/test");

    expect(fetchFn).toHaveBeenCalledWith(
      "http://api.test/test",
      expect.objectContaining({
        headers: expect.objectContaining({ Cookie: "session=abc" }),
      }),
    );
  });

  it("throws APIError on non-ok response", async () => {
    const fetchFn = mockFetch(
      404,
      { code: "NOT_FOUND", message: "Not found" },
      false,
    );
    const client = new ApiClient({ baseUrl: "http://api.test", fetchFn });

    await expect(client.get("/missing")).rejects.toThrow(APIError);
    await expect(client.get("/missing")).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      message: "Not found",
    });
  });

  it("handles async auth strategy", async () => {
    const fetchFn = mockFetch(200, {});
    const client = new ApiClient({
      baseUrl: "http://api.test",
      fetchFn,
      auth: {
        getHeaders: async () => ({ Authorization: "Bearer tok" }),
      },
    });

    await client.get("/test");

    expect(fetchFn).toHaveBeenCalledWith(
      "http://api.test/test",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer tok",
        }),
      }),
    );
  });
});
```

- [ ] **Step 4: Write public endpoints tests**

```typescript
// packages/api-client/src/endpoints/public.test.ts
import { describe, it, expect, vi } from "vitest";
import { ApiClient } from "../client";
import { publicEndpoints } from "./public";

function createMockClient() {
  return {
    get: vi.fn().mockResolvedValue({ data: [], total: 0, limit: 20, offset: 0 }),
    post: vi.fn().mockResolvedValue({ success: true }),
    patch: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
  } as unknown as ApiClient;
}

describe("publicEndpoints", () => {
  it("getMatches calls correct endpoint with params", async () => {
    const client = createMockClient();
    const api = publicEndpoints(client);

    await api.getMatches({ limit: 5, dateFrom: "2026-04-16" });

    expect(client.get).toHaveBeenCalledWith("/public/matches", {
      limit: 5,
      dateFrom: "2026-04-16",
    });
  });

  it("getMatches works without params", async () => {
    const client = createMockClient();
    const api = publicEndpoints(client);

    await api.getMatches();

    expect(client.get).toHaveBeenCalledWith("/public/matches", undefined);
  });

  it("getStandings calls correct endpoint", async () => {
    const client = createMockClient();
    const api = publicEndpoints(client);

    await api.getStandings();

    expect(client.get).toHaveBeenCalledWith("/public/standings");
  });

  it("getTeams calls correct endpoint", async () => {
    const client = createMockClient();
    const api = publicEndpoints(client);

    await api.getTeams();

    expect(client.get).toHaveBeenCalledWith("/public/teams");
  });
});
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @dragons/api-client test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/api-client/
git commit -m "test: add unit tests for @dragons/api-client

Tests for ApiClient (GET/POST, auth headers, error handling),
query string builder, and public endpoint functions."
```

---

## Task 3: Scaffold Expo App

**Files:**
- Create: `apps/native/package.json`
- Create: `apps/native/app.json`
- Create: `apps/native/tsconfig.json`
- Create: `apps/native/metro.config.js`
- Create: `apps/native/eas.json`
- Create: `apps/native/.gitignore`
- Create: `.npmrc`
- Modify: `turbo.json`

- [ ] **Step 1: Create .npmrc at repo root**

```
node-linker=hoisted
```

- [ ] **Step 2: Create apps/native/package.json**

```json
{
  "name": "@dragons/native",
  "version": "1.0.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "ios": "expo run:ios",
    "android": "expo run:android",
    "typecheck": "tsc --noEmit",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@dragons/api-client": "workspace:*",
    "@dragons/shared": "workspace:*",
    "@better-auth/expo": "^1.6.2",
    "@expo/vector-icons": "^14.0.0",
    "better-auth": "^1.6.2",
    "expo": "~55.0.0",
    "expo-camera": "~16.0.0",
    "expo-constants": "~17.0.0",
    "expo-font": "~13.0.0",
    "expo-linking": "~7.0.0",
    "expo-local-authentication": "~15.0.0",
    "expo-localization": "~16.0.0",
    "expo-notifications": "~0.31.0",
    "expo-router": "~4.0.0",
    "expo-secure-store": "~14.0.0",
    "expo-splash-screen": "~0.30.0",
    "expo-status-bar": "~2.0.0",
    "expo-web-browser": "~14.0.0",
    "i18n-js": "^4.5.1",
    "react": "19.2.5",
    "react-native": "0.83.2",
    "react-native-safe-area-context": "~5.0.0",
    "react-native-screens": "~4.0.0",
    "swr": "^2.4.1"
  },
  "devDependencies": {
    "@types/react": "^19.2.14",
    "@types/i18n-js": "^3.8.9",
    "typescript": "^6.0.2"
  }
}
```

Note: Exact Expo SDK 55 sub-versions should be resolved by `pnpm install`. The `~` ranges align with the SDK release.

- [ ] **Step 3: Create app.json**

```json
{
  "expo": {
    "name": "Dragons",
    "slug": "dragons",
    "scheme": "dragons",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "automatic",
    "newArchEnabled": true,
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#131313"
    },
    "ios": {
      "bundleIdentifier": "com.dragons.app",
      "supportsTablet": true,
      "infoPlist": {
        "NSFaceIDUsageDescription": "Use Face ID to unlock the Dragons app",
        "NSCameraUsageDescription": "Allow Dragons to access your camera for team photos"
      }
    },
    "android": {
      "package": "com.dragons.app",
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#131313"
      }
    },
    "plugins": [
      "expo-router",
      "expo-font",
      "expo-secure-store",
      "expo-local-authentication",
      [
        "expo-camera",
        {
          "cameraPermission": "Allow Dragons to access your camera for team photos."
        }
      ],
      [
        "expo-notifications",
        {
          "color": "#004b23"
        }
      ]
    ],
    "experiments": {
      "typedRoutes": true
    }
  }
}
```

- [ ] **Step 4: Create tsconfig.json**

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

- [ ] **Step 5: Create metro.config.js**

```javascript
// apps/native/metro.config.js
// SDK 55 auto-detects monorepo — minimal config needed
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

module.exports = config;
```

- [ ] **Step 6: Create eas.json**

```json
{
  "cli": {
    "version": ">= 15.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {}
  }
}
```

- [ ] **Step 7: Create .gitignore**

```
node_modules/
.expo/
dist/
*.jks
*.p8
*.p12
*.key
*.mobileprovision
*.orig.*
web-build/
ios/
android/
```

- [ ] **Step 8: Create placeholder assets**

Run:
```bash
mkdir -p apps/native/assets
# Create minimal placeholder PNGs (will be replaced with real assets later)
# Using a 1x1 pixel transparent PNG for now
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n\xb4\x00\x00\x00\x00IEND\xaeB`\x82' > apps/native/assets/icon.png
cp apps/native/assets/icon.png apps/native/assets/splash.png
cp apps/native/assets/icon.png apps/native/assets/adaptive-icon.png
```

- [ ] **Step 9: Update turbo.json to exclude native from default build**

The Expo app doesn't use the same `build` pipeline as web (it uses `eas build` or `expo export`). Exclude it from turborepo tasks that don't apply:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "remoteCache": {
    "signature": true
  },
  "tasks": {
    "dev": {
      "cache": false,
      "persistent": true
    },
    "build": {
      "dependsOn": [
        "^build"
      ],
      "outputs": [
        ".next/**",
        "dist/**"
      ]
    },
    "lint": {},
    "typecheck": {},
    "test": {
      "outputs": []
    },
    "coverage": {
      "dependsOn": [
        "^coverage"
      ],
      "outputs": [
        "coverage/**"
      ]
    },
    "clean": {
      "cache": false
    }
  }
}
```

Add to `apps/native/package.json` a turbo config to opt out of build:

Actually, the simplest approach: the native app has no `build` script in package.json (only `start`, `ios`, `android`, `typecheck`, `lint`), so turbo will skip it for `build` automatically. No turbo.json change needed.

- [ ] **Step 10: Install dependencies**

Run: `cd /Users/jn/git/dragons-all && pnpm install`
Expected: Dependencies install successfully. Check for any peer dependency warnings.

- [ ] **Step 11: Commit**

```bash
git add .npmrc apps/native/ turbo.json
git commit -m "feat: scaffold Expo app in apps/native

Expo SDK 55 project with app.json config, EAS build profiles,
Metro bundler setup, and placeholder assets. Configured for
monorepo with pnpm hoisted node_modules."
```

---

## Task 4: Design System Theme Tokens

**Files:**
- Create: `apps/native/src/theme/colors.ts`
- Create: `apps/native/src/theme/typography.ts`
- Create: `apps/native/src/theme/spacing.ts`
- Create: `apps/native/src/theme/index.ts`
- Create: `apps/native/src/hooks/useTheme.ts`

Refer to: `packages/ui/src/styles/globals.css` (source of truth for all color values)
Refer to: `packages/ui/DESIGN-SYSTEM.md` (design rules)

- [ ] **Step 1: Create colors.ts**

Port every CSS custom property from `globals.css` `:root` and `.dark` selectors:

```typescript
// apps/native/src/theme/colors.ts
export const colors = {
  light: {
    background: "#f8f9fa",
    foreground: "#191c1d",
    card: "#ffffff",
    cardForeground: "#191c1d",
    popover: "#ffffff",
    popoverForeground: "#191c1d",
    primary: "#004b23",
    primaryForeground: "#ffffff",
    secondary: "#c8eccb",
    secondaryForeground: "#4c6c51",
    muted: "#edeeef",
    mutedForeground: "#3f4940",
    accent: "#e7e8e9",
    accentForeground: "#191c1d",
    destructive: "#ba1a1a",
    destructiveForeground: "#ffffff",
    border: "#bfc9bd",
    input: "#f3f4f5",
    ring: "#004b23",
    heat: "#953d00",
    heatForeground: "#ffffff",
    heatSubtle: "#ffb692",
    brand: "#006631",
    brandForeground: "#8be19f",
    surfaceLowest: "#ffffff",
    surfaceLow: "#f3f4f5",
    surfaceBase: "#edeeef",
    surfaceHigh: "#e7e8e9",
    surfaceHighest: "#e1e3e4",
    surfaceBright: "#f8f9fa",
    chart1: "#004b23",
    chart2: "#006631",
    chart3: "#46664c",
    chart4: "#953d00",
    chart5: "#702c00",
  },
  dark: {
    background: "#131313",
    foreground: "#e2e2e2",
    card: "#2a2a2a",
    cardForeground: "#e2e2e2",
    popover: "#353535",
    popoverForeground: "#e2e2e2",
    primary: "#84d997",
    primaryForeground: "#003919",
    secondary: "#2a4a30",
    secondaryForeground: "#c8eccb",
    muted: "#1f1f1f",
    mutedForeground: "#bfc9bd",
    accent: "#2a2a2a",
    accentForeground: "#e2e2e2",
    destructive: "#ffb4ab",
    destructiveForeground: "#690005",
    border: "#3f4940",
    input: "#1f1f1f",
    ring: "#84d997",
    heat: "#ed691f",
    heatForeground: "#4c1a00",
    heatSubtle: "#ffb695",
    brand: "#006631",
    brandForeground: "#8be19f",
    surfaceLowest: "#0e0e0e",
    surfaceLow: "#1b1b1b",
    surfaceBase: "#1f1f1f",
    surfaceHigh: "#2a2a2a",
    surfaceHighest: "#353535",
    surfaceBright: "#393939",
    chart1: "#84d997",
    chart2: "#9ff6b1",
    chart3: "#006631",
    chart4: "#ed691f",
    chart5: "#ffb695",
  },
} as const;

export type ColorScheme = typeof colors.light;
export type ColorToken = keyof ColorScheme;
```

- [ ] **Step 2: Create typography.ts**

```typescript
// apps/native/src/theme/typography.ts
import type { TextStyle } from "react-native";

export const fontFamilies = {
  display: "SpaceGrotesk-Bold",
  displayMedium: "SpaceGrotesk-Medium",
  body: "Inter-Regular",
  bodyMedium: "Inter-Medium",
  bodySemiBold: "Inter-SemiBold",
} as const;

// Font asset map for expo-font loading
export const fontAssets = {
  "SpaceGrotesk-Bold": require("../../assets/fonts/SpaceGrotesk-Bold.ttf"),
  "SpaceGrotesk-Medium": require("../../assets/fonts/SpaceGrotesk-Medium.ttf"),
  "Inter-Regular": require("../../assets/fonts/Inter-Regular.ttf"),
  "Inter-Medium": require("../../assets/fonts/Inter-Medium.ttf"),
  "Inter-SemiBold": require("../../assets/fonts/Inter-SemiBold.ttf"),
};

// Predefined text styles matching DESIGN-SYSTEM.md
export const textStyles = {
  // Page titles ("LEAGUE STANDINGS", "OUR TEAMS")
  screenTitle: {
    fontFamily: fontFamilies.display,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  } satisfies TextStyle,

  // Section headers ("SENIOR TEAMS", "JUGEND")
  sectionTitle: {
    fontFamily: fontFamilies.display,
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  } satisfies TextStyle,

  // Card titles, team names
  cardTitle: {
    fontFamily: fontFamilies.display,
    fontSize: 16,
    lineHeight: 22,
  } satisfies TextStyle,

  // Large score display ("78:64")
  score: {
    fontFamily: fontFamilies.display,
    fontSize: 36,
    lineHeight: 42,
  } satisfies TextStyle,

  // KPI values, stat numbers
  stat: {
    fontFamily: fontFamilies.display,
    fontSize: 24,
    lineHeight: 30,
  } satisfies TextStyle,

  // Body text
  body: {
    fontFamily: fontFamilies.body,
    fontSize: 15,
    lineHeight: 22,
  } satisfies TextStyle,

  // Small body, captions
  caption: {
    fontFamily: fontFamilies.body,
    fontSize: 13,
    lineHeight: 18,
  } satisfies TextStyle,

  // Badge text, filter pill text
  label: {
    fontFamily: fontFamilies.displayMedium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  } satisfies TextStyle,

  // Table headers
  tableHeader: {
    fontFamily: fontFamilies.displayMedium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  } satisfies TextStyle,

  // Button text
  button: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 15,
    lineHeight: 20,
  } satisfies TextStyle,

  // Tab bar labels
  tabLabel: {
    fontFamily: fontFamilies.displayMedium,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  } satisfies TextStyle,
} as const;
```

- [ ] **Step 3: Create spacing.ts**

```typescript
// apps/native/src/theme/spacing.ts
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
} as const;

export const radius = {
  md: 4, // matches web rounded-md (0.25rem)
  pill: 9999, // badges, filter chips
} as const;
```

- [ ] **Step 4: Create theme index**

```typescript
// apps/native/src/theme/index.ts
export { colors } from "./colors";
export type { ColorScheme, ColorToken } from "./colors";
export { fontFamilies, fontAssets, textStyles } from "./typography";
export { spacing, radius } from "./spacing";
```

- [ ] **Step 5: Create useTheme hook**

```typescript
// apps/native/src/hooks/useTheme.ts
import { useColorScheme } from "react-native";
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from "react";
import type { PropsWithChildren } from "react";
import { colors, spacing, radius, textStyles } from "@/theme";
import type { ColorScheme } from "@/theme";

type ThemeMode = "system" | "light" | "dark";

interface ThemeContextValue {
  colors: ColorScheme;
  textStyles: typeof textStyles;
  spacing: typeof spacing;
  radius: typeof radius;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>("system");

  const isDark =
    mode === "system" ? systemScheme === "dark" : mode === "dark";

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: isDark ? colors.dark : colors.light,
      textStyles,
      spacing,
      radius,
      isDark,
      mode,
      setMode,
    }),
    [isDark, mode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
```

- [ ] **Step 6: Download font files**

Run:
```bash
mkdir -p apps/native/assets/fonts
cd apps/native/assets/fonts

# Download Space Grotesk from Google Fonts
curl -sL "https://github.com/nicoleye/fonts-files/raw/refs/heads/master/fonts/google/SpaceGrotesk-Bold.ttf" -o SpaceGrotesk-Bold.ttf
curl -sL "https://github.com/nicoleye/fonts-files/raw/refs/heads/master/fonts/google/SpaceGrotesk-Medium.ttf" -o SpaceGrotesk-Medium.ttf

# Download Inter
curl -sL "https://github.com/rsms/inter/raw/master/fonts/ttf/Inter-Regular.ttf" -o Inter-Regular.ttf
curl -sL "https://github.com/rsms/inter/raw/master/fonts/ttf/Inter-Medium.ttf" -o Inter-Medium.ttf
curl -sL "https://github.com/rsms/inter/raw/master/fonts/ttf/Inter-SemiBold.ttf" -o Inter-SemiBold.ttf
```

If the URLs above are stale, download from:
- Space Grotesk: https://fonts.google.com/specimen/Space+Grotesk
- Inter: https://rsms.me/inter/

- [ ] **Step 7: Verify typecheck**

Run: `pnpm --filter @dragons/native typecheck`
Expected: Clean typecheck. If path aliases fail, the `tsconfig.json` paths config may need adjustment once expo is installed.

- [ ] **Step 8: Commit**

```bash
git add apps/native/src/theme/ apps/native/src/hooks/useTheme.ts apps/native/assets/fonts/
git commit -m "feat(native): add Dragon's Lair design system tokens

Port color tokens (light/dark), typography (Space Grotesk + Inter),
spacing scale, and radius from web CSS custom properties. ThemeProvider
with system/light/dark mode support."
```

---

## Task 5: Core Native Components

**Files:**
- Create: `apps/native/src/components/Screen.tsx`
- Create: `apps/native/src/components/Card.tsx`
- Create: `apps/native/src/components/Badge.tsx`
- Create: `apps/native/src/components/FilterPill.tsx`
- Create: `apps/native/src/components/SectionHeader.tsx`
- Create: `apps/native/src/components/StatStrip.tsx`
- Create: `apps/native/src/components/MatchCard.tsx`
- Create: `apps/native/src/components/StandingsRow.tsx`
- Create: `apps/native/src/components/TeamCard.tsx`
- Create: `apps/native/src/components/Header.tsx`

Each component must enforce design system rules. Refer to `packages/ui/DESIGN-SYSTEM.md` for the rules (no borders for sectioning, sharp corners, tonal layering, heat for urgency, display font for headings).

- [ ] **Step 1: Create Screen.tsx**

```tsx
// apps/native/src/components/Screen.tsx
import { ScrollView, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
}

export function Screen({ children, scroll = true, style }: ScreenProps) {
  const { colors } = useTheme();

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: colors.background,
  };

  const contentStyle: ViewStyle = {
    paddingHorizontal: 16,
    paddingBottom: 24,
    ...style,
  };

  if (scroll) {
    return (
      <SafeAreaView style={containerStyle} edges={["top"]}>
        <ScrollView
          contentContainerStyle={contentStyle}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={containerStyle} edges={["top"]}>
      <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Create Card.tsx**

```tsx
// apps/native/src/components/Card.tsx
import { View, Pressable, type ViewStyle } from "react-native";
import { useTheme } from "@/hooks/useTheme";

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
}

// Design rule: no border, tonal lift via surfaceLowest, radius.md
export function Card({ children, onPress, style }: CardProps) {
  const { colors, radius: r } = useTheme();

  const cardStyle: ViewStyle = {
    backgroundColor: colors.surfaceLowest,
    borderRadius: r.md,
    padding: 16,
    ...style,
  };

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          cardStyle,
          pressed && { backgroundColor: colors.surfaceHigh },
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={cardStyle}>{children}</View>;
}
```

- [ ] **Step 3: Create Badge.tsx**

```tsx
// apps/native/src/components/Badge.tsx
import { View, Text, type ViewStyle } from "react-native";
import { useTheme } from "@/hooks/useTheme";

type BadgeVariant = "default" | "secondary" | "heat" | "destructive";

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

export function Badge({ label, variant = "default" }: BadgeProps) {
  const { colors, radius: r, textStyles } = useTheme();

  const variantStyles: Record<BadgeVariant, { bg: string; fg: string }> = {
    default: { bg: colors.primary, fg: colors.primaryForeground },
    secondary: { bg: colors.secondary, fg: colors.secondaryForeground },
    heat: { bg: colors.heat, fg: colors.heatForeground },
    destructive: { bg: colors.destructive, fg: colors.destructiveForeground },
  };

  const { bg, fg } = variantStyles[variant];

  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: r.pill,
        paddingHorizontal: 10,
        paddingVertical: 4,
        alignSelf: "flex-start",
      }}
    >
      <Text style={[textStyles.label, { color: fg }]}>{label}</Text>
    </View>
  );
}
```

- [ ] **Step 4: Create FilterPill.tsx**

```tsx
// apps/native/src/components/FilterPill.tsx
import { Pressable, Text } from "react-native";
import { useTheme } from "@/hooks/useTheme";

interface FilterPillProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

export function FilterPill({ label, active, onPress }: FilterPillProps) {
  const { colors, radius: r, textStyles } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: active ? colors.primary : colors.surfaceHigh,
        borderRadius: r.pill,
        paddingHorizontal: 16,
        paddingVertical: 8,
        marginRight: 8,
      }}
    >
      <Text
        style={[
          textStyles.label,
          {
            color: active ? colors.primaryForeground : colors.mutedForeground,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
```

- [ ] **Step 5: Create SectionHeader.tsx**

```tsx
// apps/native/src/components/SectionHeader.tsx
import { View, Text } from "react-native";
import { useTheme } from "@/hooks/useTheme";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
}

export function SectionHeader({ title, subtitle }: SectionHeaderProps) {
  const { colors, textStyles } = useTheme();

  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={[textStyles.sectionTitle, { color: colors.foreground }]}>
        {title}
      </Text>
      {subtitle && (
        <Text
          style={[
            textStyles.caption,
            { color: colors.mutedForeground, marginTop: 4 },
          ]}
        >
          {subtitle}
        </Text>
      )}
    </View>
  );
}
```

- [ ] **Step 6: Create StatStrip.tsx**

```tsx
// apps/native/src/components/StatStrip.tsx
import { View, Text } from "react-native";
import { useTheme } from "@/hooks/useTheme";

interface StatItem {
  label: string;
  value: string | number;
}

interface StatStripProps {
  items: StatItem[];
}

export function StatStrip({ items }: StatStripProps) {
  const { colors, radius: r, textStyles } = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: colors.surfaceLow,
        borderRadius: r.md,
        padding: 16,
      }}
    >
      {items.map((item, i) => (
        <View
          key={item.label}
          style={{
            flex: 1,
            alignItems: "center",
            borderLeftWidth: i > 0 ? 1 : 0,
            borderLeftColor: i > 0 ? `${colors.border}26` : undefined, // 15% opacity
          }}
        >
          <Text style={[textStyles.stat, { color: colors.foreground }]}>
            {item.value}
          </Text>
          <Text
            style={[
              textStyles.caption,
              { color: colors.mutedForeground, marginTop: 2 },
            ]}
          >
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
```

- [ ] **Step 7: Create MatchCard.tsx**

```tsx
// apps/native/src/components/MatchCard.tsx
import { View, Text, Pressable } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { Badge } from "./Badge";
import type { MatchListItem } from "@dragons/shared";

interface MatchCardProps {
  match: MatchListItem;
  onPress?: () => void;
}

function formatTime(time: string): string {
  // "18:30:00" -> "18:30"
  return time.slice(0, 5);
}

export function MatchCard({ match, onPress }: MatchCardProps) {
  const { colors, radius: r, textStyles } = useTheme();

  const isHome = match.isHomeGame;
  const hasScore = match.homeScore !== null && match.guestScore !== null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.surfaceHigh : colors.surfaceLowest,
        borderRadius: r.md,
        padding: 16,
        marginBottom: 8,
        // Own-club highlight: left border accent
        borderLeftWidth: 2,
        borderLeftColor: isHome ? colors.primary : "transparent",
      })}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text
          style={[textStyles.label, { color: colors.mutedForeground }]}
        >
          {formatTime(match.kickoffTime)}
        </Text>
        {isHome !== undefined && (
          <Badge
            label={isHome ? "HOME" : "AWAY"}
            variant={isHome ? "default" : "secondary"}
          />
        )}
      </View>

      <View style={{ marginTop: 8 }}>
        <Text
          style={[
            textStyles.body,
            {
              color: colors.foreground,
              fontFamily: isHome ? "Inter-SemiBold" : "Inter-Regular",
            },
          ]}
          numberOfLines={1}
        >
          {match.homeTeamName}
        </Text>
        <Text
          style={[
            textStyles.body,
            {
              color: colors.foreground,
              fontFamily: !isHome ? "Inter-SemiBold" : "Inter-Regular",
              marginTop: 2,
            },
          ]}
          numberOfLines={1}
        >
          {match.guestTeamName}
        </Text>
      </View>

      {hasScore && (
        <View style={{ flexDirection: "row", marginTop: 8 }}>
          <Text style={[textStyles.cardTitle, { color: colors.foreground }]}>
            {match.homeScore} : {match.guestScore}
          </Text>
        </View>
      )}

      {match.venueName && (
        <Text
          style={[
            textStyles.caption,
            { color: colors.mutedForeground, marginTop: 8 },
          ]}
          numberOfLines={1}
        >
          {match.venueName}
        </Text>
      )}
    </Pressable>
  );
}
```

- [ ] **Step 8: Create StandingsRow.tsx**

```tsx
// apps/native/src/components/StandingsRow.tsx
import { View, Text } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import type { StandingItem } from "@dragons/shared";

interface StandingsRowProps {
  item: StandingItem;
  isOwnClub: boolean;
}

export function StandingsRow({ item, isOwnClub }: StandingsRowProps) {
  const { colors, textStyles } = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: isOwnClub ? `${colors.primary}0D` : "transparent", // 5% opacity
        borderLeftWidth: isOwnClub ? 2 : 0,
        borderLeftColor: isOwnClub ? `${colors.primary}80` : undefined, // 50% opacity
      }}
    >
      <Text
        style={[
          textStyles.tableHeader,
          { color: colors.mutedForeground, width: 32 },
        ]}
      >
        {String(item.position).padStart(2, "0")}
      </Text>
      <Text
        style={[
          textStyles.body,
          {
            color: isOwnClub ? colors.primary : colors.foreground,
            flex: 1,
            fontFamily: isOwnClub ? "Inter-SemiBold" : "Inter-Regular",
          },
        ]}
        numberOfLines={1}
      >
        {item.teamName}
      </Text>
      <Text
        style={[
          textStyles.body,
          { color: colors.foreground, width: 32, textAlign: "center" },
        ]}
      >
        {item.won}
      </Text>
      <Text
        style={[
          textStyles.body,
          { color: colors.foreground, width: 32, textAlign: "center" },
        ]}
      >
        {item.lost}
      </Text>
      <Text
        style={[
          textStyles.cardTitle,
          { color: colors.foreground, width: 40, textAlign: "right" },
        ]}
      >
        {item.leaguePoints}
      </Text>
    </View>
  );
}
```

- [ ] **Step 9: Create TeamCard.tsx**

```tsx
// apps/native/src/components/TeamCard.tsx
import { View, Text, Pressable, type ViewStyle } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import type { PublicTeam } from "@dragons/api-client";

interface TeamCardProps {
  team: PublicTeam;
  featured?: boolean;
  onPress?: () => void;
}

function resolveTeamName(team: PublicTeam): string {
  return team.customName || team.shortName || team.name;
}

export function TeamCard({ team, featured, onPress }: TeamCardProps) {
  const { colors, radius: r, textStyles } = useTheme();

  const height = featured ? 200 : 120;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.surfaceHigh : colors.surfaceLowest,
        borderRadius: r.md,
        height,
        justifyContent: "flex-end",
        padding: 16,
        overflow: "hidden",
      })}
    >
      {/* Gradient overlay placeholder — replace with team image when available */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.surfaceLow,
        }}
      />
      <View style={{ zIndex: 1 }}>
        <Text
          style={[
            featured ? textStyles.screenTitle : textStyles.cardTitle,
            { color: colors.foreground },
          ]}
        >
          {resolveTeamName(team)}
        </Text>
        {team.leagueName && (
          <Text
            style={[
              textStyles.caption,
              { color: colors.mutedForeground, marginTop: 2 },
            ]}
            numberOfLines={1}
          >
            {team.leagueName}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
```

- [ ] **Step 10: Create Header.tsx**

```tsx
// apps/native/src/components/Header.tsx
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";

export function Header() {
  const { colors, textStyles } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingTop: insets.top + 8,
        paddingBottom: 12,
        backgroundColor: colors.background,
      }}
    >
      <Text style={[textStyles.sectionTitle, { color: colors.foreground }]}>
        HANOVER DRAGONS
      </Text>
      <Pressable
        onPress={() => router.push("/profile")}
        hitSlop={8}
      >
        <Ionicons
          name="person-circle-outline"
          size={28}
          color={colors.mutedForeground}
        />
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 11: Commit**

```bash
git add apps/native/src/components/
git commit -m "feat(native): add core UI components

Screen, Card, Badge, FilterPill, SectionHeader, StatStrip, MatchCard,
StandingsRow, TeamCard, Header. All enforce Dragon's Lair design rules:
tonal layering, sharp corners, display font headings, heat for urgency."
```

---

## Task 6: Auth Setup (Server + Native Client)

**Files:**
- Modify: `apps/api/src/config/auth.ts`
- Modify: `apps/api/package.json`
- Create: `apps/native/src/lib/auth-client.ts`
- Create: `apps/native/src/lib/api.ts`

- [ ] **Step 1: Add @better-auth/expo to API dependencies**

Run: `pnpm --filter @dragons/api add @better-auth/expo`

- [ ] **Step 2: Add expo plugin to auth config**

In `apps/api/src/config/auth.ts`, add the import and plugin:

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins/admin";
import { expo } from "@better-auth/expo";
import { db } from "./database";
import { env } from "./env";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [
    ...env.TRUSTED_ORIGINS,
    "dragons://",
    "dragons://*",
    ...(env.NODE_ENV === "development" ? ["exp://*"] : []),
  ],
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  advanced: {
    cookiePrefix: "dragons",
    crossSubDomainCookies:
      env.NODE_ENV === "production"
        ? { enabled: true, domain: ".app.hbdragons.de" }
        : { enabled: false },
    defaultCookieAttributes: {
      sameSite: "lax",
      httpOnly: true,
      secure: env.NODE_ENV === "production",
    },
  },
  plugins: [
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
    }),
    expo(),
  ],
});
```

Note: `env.TRUSTED_ORIGINS` is already an array parsed from the environment. The `dragons://` and `exp://` schemes are added inline.

- [ ] **Step 3: Verify API still typechecks**

Run: `pnpm --filter @dragons/api typecheck`
Expected: No errors.

- [ ] **Step 4: Create native auth client**

```typescript
// apps/native/src/lib/auth-client.ts
import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";

const baseURL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3001";

export const authClient = createAuthClient({
  baseURL,
  plugins: [
    expoClient({
      scheme: "dragons",
      storagePrefix: "dragons",
      storage: SecureStore,
    }),
  ],
});
```

- [ ] **Step 5: Create native API client instance**

```typescript
// apps/native/src/lib/api.ts
import { ApiClient, publicEndpoints, deviceEndpoints } from "@dragons/api-client";
import { authClient } from "./auth-client";

const baseUrl = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3001";

export const apiClient = new ApiClient({
  baseUrl,
  auth: {
    getHeaders() {
      const cookie = authClient.getCookie();
      if (cookie) {
        return { Cookie: cookie };
      }
      return {};
    },
  },
});

export const publicApi = publicEndpoints(apiClient);
export const deviceApi = deviceEndpoints(apiClient);
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/config/auth.ts apps/api/package.json apps/native/src/lib/
git commit -m "feat: integrate Better Auth Expo plugin

Add expo() plugin to API auth config with dragons:// trusted origin.
Create native auth client with SecureStore and API client instance."
```

---

## Task 7: Root Layout and Tab Navigation

**Files:**
- Create: `apps/native/src/lib/i18n.ts`
- Create: `apps/native/src/i18n/de.json`
- Create: `apps/native/src/i18n/en.json`
- Create: `apps/native/src/app/_layout.tsx`
- Create: `apps/native/src/app/(tabs)/_layout.tsx`

- [ ] **Step 1: Create i18n setup**

```typescript
// apps/native/src/lib/i18n.ts
import { I18n } from "i18n-js";
import { getLocales } from "expo-localization";
import de from "@/i18n/de.json";
import en from "@/i18n/en.json";

const i18n = new I18n({ de, en });

const deviceLocale = getLocales()[0]?.languageCode ?? "de";
i18n.locale = deviceLocale === "de" ? "de" : "en";
i18n.defaultLocale = "de";
i18n.enableFallback = true;

export { i18n };
```

- [ ] **Step 2: Create translation files**

```json
// apps/native/src/i18n/de.json
{
  "tabs": {
    "home": "Home",
    "schedule": "Spielplan",
    "standings": "Tabelle",
    "teams": "Teams"
  },
  "home": {
    "nextGame": "Nächstes Spiel",
    "lastResult": "Letztes Ergebnis",
    "vs": "VS",
    "noUpcoming": "Keine anstehenden Spiele"
  },
  "schedule": {
    "title": "Spielplan",
    "allGames": "Alle Spiele",
    "homeOnly": "Nur Heim",
    "away": "Auswärts",
    "loadMore": "Weitere Spiele laden",
    "noMatches": "Keine Spiele gefunden"
  },
  "standings": {
    "title": "Tabelle",
    "pos": "Pos",
    "team": "Team",
    "won": "S",
    "lost": "N",
    "points": "Pkt"
  },
  "teams": {
    "title": "Unsere Teams",
    "subtitle": "Alle Mannschaften von der Jugend bis zum Profi",
    "senior": "Senioren",
    "youth": "Jugend"
  },
  "auth": {
    "signIn": "Anmelden",
    "signUp": "Registrieren",
    "email": "E-Mail",
    "password": "Passwort",
    "name": "Name",
    "noAccount": "Noch kein Konto?",
    "hasAccount": "Bereits ein Konto?"
  },
  "profile": {
    "title": "Profil",
    "biometricLock": "Biometrische Sperre",
    "theme": "Design",
    "themeSystem": "System",
    "themeLight": "Hell",
    "themeDark": "Dunkel",
    "signOut": "Abmelden"
  },
  "common": {
    "home": "Heim",
    "away": "Auswärts",
    "details": "Details",
    "cancel": "Abbrechen",
    "save": "Speichern",
    "loading": "Laden..."
  }
}
```

```json
// apps/native/src/i18n/en.json
{
  "tabs": {
    "home": "Home",
    "schedule": "Schedule",
    "standings": "Tables",
    "teams": "Teams"
  },
  "home": {
    "nextGame": "Next Game",
    "lastResult": "Last Result",
    "vs": "VS",
    "noUpcoming": "No upcoming games"
  },
  "schedule": {
    "title": "Schedule",
    "allGames": "All Games",
    "homeOnly": "Home Only",
    "away": "Away",
    "loadMore": "Load More Games",
    "noMatches": "No matches found"
  },
  "standings": {
    "title": "Standings",
    "pos": "Pos",
    "team": "Team",
    "won": "W",
    "lost": "L",
    "points": "Pts"
  },
  "teams": {
    "title": "Our Teams",
    "subtitle": "All teams from youth to professional level",
    "senior": "Senior Teams",
    "youth": "Youth"
  },
  "auth": {
    "signIn": "Sign In",
    "signUp": "Sign Up",
    "email": "Email",
    "password": "Password",
    "name": "Name",
    "noAccount": "Don't have an account?",
    "hasAccount": "Already have an account?"
  },
  "profile": {
    "title": "Profile",
    "biometricLock": "Biometric Lock",
    "theme": "Theme",
    "themeSystem": "System",
    "themeLight": "Light",
    "themeDark": "Dark",
    "signOut": "Sign Out"
  },
  "common": {
    "home": "Home",
    "away": "Away",
    "details": "Details",
    "cancel": "Cancel",
    "save": "Save",
    "loading": "Loading..."
  }
}
```

- [ ] **Step 3: Create root layout**

```tsx
// apps/native/src/app/_layout.tsx
import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { ThemeProvider, useTheme } from "@/hooks/useTheme";
import { fontAssets } from "@/theme/typography";
import "@/lib/i18n"; // Initialize i18n

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { colors, isDark } = useTheme();

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="team/[id]" options={{ headerShown: true, title: "" }} />
        <Stack.Screen name="game/[id]" options={{ headerShown: true, title: "" }} />
        <Stack.Screen name="(auth)" options={{ presentation: "modal" }} />
        <Stack.Screen name="profile" options={{ headerShown: true, title: "" }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts(fontAssets);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ThemeProvider>
      <RootNavigator />
    </ThemeProvider>
  );
}
```

- [ ] **Step 4: Create tab layout**

```tsx
// apps/native/src/app/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { Header } from "@/components/Header";
import { i18n } from "@/lib/i18n";

export default function TabLayout() {
  const { colors, textStyles } = useTheme();

  return (
    <>
      <Header />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.surfaceLow,
            borderTopWidth: 0, // No-line rule
            elevation: 0,
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.mutedForeground,
          tabBarLabelStyle: {
            fontFamily: textStyles.tabLabel.fontFamily,
            fontSize: textStyles.tabLabel.fontSize,
            letterSpacing: textStyles.tabLabel.letterSpacing,
            textTransform: "uppercase",
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: i18n.t("tabs.home"),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="schedule"
          options={{
            title: i18n.t("tabs.schedule"),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="calendar" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="standings"
          options={{
            title: i18n.t("tabs.standings"),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="trophy" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="teams"
          options={{
            title: i18n.t("tabs.teams"),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="people" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </>
  );
}
```

- [ ] **Step 5: Create placeholder tab screens so the app boots**

```tsx
// apps/native/src/app/(tabs)/index.tsx
import { View, Text } from "react-native";
import { useTheme } from "@/hooks/useTheme";

export default function HomeScreen() {
  const { colors, textStyles } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }}>
      <Text style={[textStyles.screenTitle, { color: colors.foreground }]}>HOME</Text>
    </View>
  );
}
```

```tsx
// apps/native/src/app/(tabs)/schedule.tsx
import { View, Text } from "react-native";
import { useTheme } from "@/hooks/useTheme";

export default function ScheduleScreen() {
  const { colors, textStyles } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }}>
      <Text style={[textStyles.screenTitle, { color: colors.foreground }]}>SCHEDULE</Text>
    </View>
  );
}
```

```tsx
// apps/native/src/app/(tabs)/standings.tsx
import { View, Text } from "react-native";
import { useTheme } from "@/hooks/useTheme";

export default function StandingsScreen() {
  const { colors, textStyles } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }}>
      <Text style={[textStyles.screenTitle, { color: colors.foreground }]}>STANDINGS</Text>
    </View>
  );
}
```

```tsx
// apps/native/src/app/(tabs)/teams.tsx
import { View, Text } from "react-native";
import { useTheme } from "@/hooks/useTheme";

export default function TeamsScreen() {
  const { colors, textStyles } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }}>
      <Text style={[textStyles.screenTitle, { color: colors.foreground }]}>TEAMS</Text>
    </View>
  );
}
```

- [ ] **Step 6: Create placeholder for auth and detail routes**

```tsx
// apps/native/src/app/(auth)/_layout.tsx
import { Stack } from "expo-router";

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

```tsx
// apps/native/src/app/(auth)/sign-in.tsx
import { View, Text } from "react-native";
export default function SignInScreen() {
  return <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}><Text>Sign In</Text></View>;
}
```

```tsx
// apps/native/src/app/(auth)/sign-up.tsx
import { View, Text } from "react-native";
export default function SignUpScreen() {
  return <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}><Text>Sign Up</Text></View>;
}
```

```tsx
// apps/native/src/app/team/[id].tsx
import { View, Text } from "react-native";
export default function TeamDetailScreen() {
  return <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}><Text>Team Detail</Text></View>;
}
```

```tsx
// apps/native/src/app/game/[id].tsx
import { View, Text } from "react-native";
export default function GameDetailScreen() {
  return <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}><Text>Game Detail</Text></View>;
}
```

```tsx
// apps/native/src/app/profile.tsx
import { View, Text } from "react-native";
export default function ProfileScreen() {
  return <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}><Text>Profile</Text></View>;
}
```

- [ ] **Step 7: Install all dependencies and verify the app starts**

Run:
```bash
cd /Users/jn/git/dragons-all
pnpm install
cd apps/native
npx expo start
```

Expected: Metro bundler starts. Press `i` for iOS simulator — app loads with 4 tabs, placeholder text on each screen, Dragon's Lair dark theme on dark mode devices.

- [ ] **Step 8: Commit**

```bash
git add apps/native/src/app/ apps/native/src/lib/i18n.ts apps/native/src/i18n/
git commit -m "feat(native): add root layout, tab navigation, and i18n

Root layout with ThemeProvider, font loading, splash screen.
4-tab navigation (Home, Schedule, Tables, Teams) matching Stitch
mockups. German and English translations. Placeholder screens."
```

---

## Task 8: Home Screen

**Files:**
- Modify: `apps/native/src/app/(tabs)/index.tsx`

- [ ] **Step 1: Implement Home screen**

Replace the placeholder with the full implementation. Refer to Stitch screen "Home (Dark - Simplified)" for layout.

```tsx
// apps/native/src/app/(tabs)/index.tsx
import { View, Text, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import useSWR from "swr";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { StatStrip } from "@/components/StatStrip";
import { useTheme } from "@/hooks/useTheme";
import { publicApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function HomeScreen() {
  const { colors, textStyles } = useTheme();
  const router = useRouter();
  const today = todayISO();

  const { data: nextData } = useSWR("home-next", () =>
    publicApi.getMatches({ limit: 1, dateFrom: today, hasScore: false }),
  );
  const { data: lastData } = useSWR("home-last", () =>
    publicApi.getMatches({ limit: 1, dateTo: today, hasScore: true, sort: "desc" }),
  );
  const { data: standingsData } = useSWR("home-standings", () =>
    publicApi.getStandings(),
  );

  const nextMatch = nextData?.data[0];
  const lastMatch = lastData?.data[0];

  // Find best own-club position across leagues
  const ownPosition = standingsData
    ?.flatMap((league) => league.standings)
    .filter((s) => s.isOwnClub)
    .sort((a, b) => a.position - b.position)[0];

  const loading = !nextData && !lastData;

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 100 }} />
      </Screen>
    );
  }

  return (
    <Screen>
      {/* Next Game */}
      {nextMatch && (
        <Card
          onPress={() => router.push(`/game/${nextMatch.id}`)}
          style={{ marginBottom: 16 }}
        >
          <Badge label={i18n.t("home.nextGame")} variant="heat" />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 16,
              gap: 16,
            }}
          >
            <Text
              style={[
                textStyles.cardTitle,
                { color: colors.foreground, flex: 1, textAlign: "right" },
              ]}
              numberOfLines={2}
            >
              {nextMatch.homeTeamName}
            </Text>
            <Text style={[textStyles.stat, { color: colors.mutedForeground }]}>
              {i18n.t("home.vs")}
            </Text>
            <Text
              style={[
                textStyles.cardTitle,
                { color: colors.foreground, flex: 1 },
              ]}
              numberOfLines={2}
            >
              {nextMatch.guestTeamName}
            </Text>
          </View>
          <Text
            style={[
              textStyles.caption,
              {
                color: colors.mutedForeground,
                textAlign: "center",
                marginTop: 12,
              },
            ]}
          >
            {nextMatch.kickoffDate} {nextMatch.kickoffTime.slice(0, 5)}
            {nextMatch.venueName ? ` · ${nextMatch.venueName}` : ""}
          </Text>
        </Card>
      )}

      {/* Last Result */}
      {lastMatch && (
        <Card
          onPress={() => router.push(`/game/${lastMatch.id}`)}
          style={{ marginBottom: 16 }}
        >
          <Badge label={i18n.t("home.lastResult")} />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 16,
              gap: 16,
            }}
          >
            <Text
              style={[
                textStyles.cardTitle,
                { color: colors.foreground, flex: 1, textAlign: "right" },
              ]}
              numberOfLines={2}
            >
              {lastMatch.homeTeamName}
            </Text>
            <Text style={[textStyles.score, { color: colors.foreground }]}>
              {lastMatch.homeScore}:{lastMatch.guestScore}
            </Text>
            <Text
              style={[
                textStyles.cardTitle,
                { color: colors.foreground, flex: 1 },
              ]}
              numberOfLines={2}
            >
              {lastMatch.guestTeamName}
            </Text>
          </View>
        </Card>
      )}

      {!nextMatch && !lastMatch && (
        <Card style={{ marginBottom: 16 }}>
          <Text style={[textStyles.body, { color: colors.mutedForeground, textAlign: "center" }]}>
            {i18n.t("home.noUpcoming")}
          </Text>
        </Card>
      )}

      {/* Navigation Cards */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
        <Card onPress={() => router.push("/(tabs)/schedule")} style={{ flex: 1 }}>
          <Text style={[textStyles.cardTitle, { color: colors.foreground }]}>
            {i18n.t("tabs.schedule")}
          </Text>
        </Card>
        <Card onPress={() => router.push("/(tabs)/standings")} style={{ flex: 1 }}>
          <Text style={[textStyles.cardTitle, { color: colors.foreground }]}>
            {i18n.t("tabs.standings")}
          </Text>
        </Card>
      </View>

      {/* Stat Strip */}
      <StatStrip
        items={[
          {
            label: "Rank",
            value: ownPosition ? `#${ownPosition.position}` : "-",
          },
          {
            label: "Wins",
            value: ownPosition?.won ?? "-",
          },
          {
            label: "Pts",
            value: ownPosition?.leaguePoints ?? "-",
          },
        ]}
      />
    </Screen>
  );
}
```

- [ ] **Step 2: Test on simulator**

Run: `cd apps/native && npx expo start` then press `i`.
Expected: Home screen shows next game card, last result card, navigation cards, and stat strip. Data loads from API (must have API running: `pnpm --filter @dragons/api dev`).

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/app/\(tabs\)/index.tsx
git commit -m "feat(native): implement Home screen

Next game VS card, last result with score, navigation cards,
stat strip with league position. Uses SWR for data fetching
from public API endpoints."
```

---

## Task 9: Schedule Screen

**Files:**
- Modify: `apps/native/src/app/(tabs)/schedule.tsx`

- [ ] **Step 1: Implement Schedule screen**

Replace placeholder. Refer to Stitch "Schedule (Dark - Simplified)": filter pills, match list grouped by date.

```tsx
// apps/native/src/app/(tabs)/schedule.tsx
import { useState, useMemo } from "react";
import { View, Text, SectionList, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import useSWR from "swr";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { FilterPill } from "@/components/FilterPill";
import { MatchCard } from "@/components/MatchCard";
import { useTheme } from "@/hooks/useTheme";
import { publicApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";
import type { MatchListItem } from "@dragons/shared";

type Filter = "all" | "home" | "away";

function groupByDate(
  matches: MatchListItem[],
): { title: string; data: MatchListItem[] }[] {
  const groups = new Map<string, MatchListItem[]>();
  for (const match of matches) {
    const date = match.kickoffDate;
    const existing = groups.get(date);
    if (existing) {
      existing.push(match);
    } else {
      groups.set(date, [match]);
    }
  }
  return Array.from(groups, ([title, data]) => ({ title, data }));
}

export default function ScheduleScreen() {
  const { colors, textStyles } = useTheme();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(20);

  const { data, isLoading } = useSWR(
    `schedule-${filter}-${limit}`,
    () => publicApi.getMatches({ limit, offset: 0 }),
  );

  const matches = data?.data ?? [];

  const filtered = useMemo(() => {
    if (filter === "all") return matches;
    return matches.filter((m) =>
      filter === "home" ? m.isHomeGame : !m.isHomeGame,
    );
  }, [matches, filter]);

  const sections = useMemo(() => groupByDate(filtered), [filtered]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
        <SectionHeader
          title={i18n.t("schedule.title")}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 8 }}
        >
          <FilterPill
            label={i18n.t("schedule.allGames")}
            active={filter === "all"}
            onPress={() => setFilter("all")}
          />
          <FilterPill
            label={i18n.t("schedule.homeOnly")}
            active={filter === "home"}
            onPress={() => setFilter("home")}
          />
          <FilterPill
            label={i18n.t("schedule.away")}
            active={filter === "away"}
            onPress={() => setFilter("away")}
          />
        </ScrollView>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          renderSectionHeader={({ section }) => (
            <Text
              style={[
                textStyles.label,
                {
                  color: colors.mutedForeground,
                  marginTop: 24,
                  marginBottom: 8,
                },
              ]}
            >
              {section.title}
            </Text>
          )}
          renderItem={({ item }) => (
            <MatchCard
              match={item}
              onPress={() => router.push(`/game/${item.id}`)}
            />
          )}
          ListEmptyComponent={
            <Text
              style={[
                textStyles.body,
                {
                  color: colors.mutedForeground,
                  textAlign: "center",
                  marginTop: 40,
                },
              ]}
            >
              {i18n.t("schedule.noMatches")}
            </Text>
          }
          ListFooterComponent={
            data && data.total > limit ? (
              <View style={{ alignItems: "center", marginTop: 16 }}>
                <FilterPill
                  label={i18n.t("schedule.loadMore")}
                  active={false}
                  onPress={() => setLimit((l) => l + 20)}
                />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}
```

- [ ] **Step 2: Test on simulator**

Run: `cd apps/native && npx expo start`, press `i`, navigate to Schedule tab.
Expected: Filter pills at top, matches grouped by date, MatchCards with team names, time, venue tags.

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/app/\(tabs\)/schedule.tsx
git commit -m "feat(native): implement Schedule screen

Filter pills (All/Home/Away), SectionList grouped by date,
MatchCards with own-club highlighting. Load-more pagination."
```

---

## Task 10: Standings Screen

**Files:**
- Modify: `apps/native/src/app/(tabs)/standings.tsx`

- [ ] **Step 1: Implement Standings screen**

```tsx
// apps/native/src/app/(tabs)/standings.tsx
import { View, Text, FlatList, ActivityIndicator } from "react-native";
import useSWR from "swr";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { StandingsRow } from "@/components/StandingsRow";
import { useTheme } from "@/hooks/useTheme";
import { publicApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";

export default function StandingsScreen() {
  const { colors, textStyles } = useTheme();

  const { data, isLoading } = useSWR("standings", () =>
    publicApi.getStandings(),
  );

  if (isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 100 }} />
      </Screen>
    );
  }

  return (
    <Screen>
      <SectionHeader title={i18n.t("standings.title")} />

      {data?.map((league) => (
        <View key={league.leagueId} style={{ marginBottom: 32 }}>
          <Text
            style={[
              textStyles.cardTitle,
              { color: colors.foreground, marginBottom: 12 },
            ]}
          >
            {league.leagueName}
          </Text>

          {/* Table header */}
          <View
            style={{
              flexDirection: "row",
              paddingVertical: 8,
              paddingHorizontal: 16,
              backgroundColor: colors.surfaceLow,
              borderRadius: 4,
              marginBottom: 4,
            }}
          >
            <Text
              style={[textStyles.tableHeader, { color: colors.mutedForeground, width: 32 }]}
            >
              {i18n.t("standings.pos")}
            </Text>
            <Text
              style={[textStyles.tableHeader, { color: colors.mutedForeground, flex: 1 }]}
            >
              {i18n.t("standings.team")}
            </Text>
            <Text
              style={[
                textStyles.tableHeader,
                { color: colors.mutedForeground, width: 32, textAlign: "center" },
              ]}
            >
              {i18n.t("standings.won")}
            </Text>
            <Text
              style={[
                textStyles.tableHeader,
                { color: colors.mutedForeground, width: 32, textAlign: "center" },
              ]}
            >
              {i18n.t("standings.lost")}
            </Text>
            <Text
              style={[
                textStyles.tableHeader,
                { color: colors.mutedForeground, width: 40, textAlign: "right" },
              ]}
            >
              {i18n.t("standings.points")}
            </Text>
          </View>

          {/* Table rows */}
          {league.standings.map((item) => (
            <StandingsRow
              key={`${league.leagueId}-${item.teamId}`}
              item={item}
              isOwnClub={item.isOwnClub}
            />
          ))}
        </View>
      ))}
    </Screen>
  );
}
```

- [ ] **Step 2: Test on simulator**

Navigate to Tables tab. Expected: League name, table header row, standings rows with own-club row highlighted in green tint.

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/app/\(tabs\)/standings.tsx
git commit -m "feat(native): implement Standings screen

League tables with header row, standings rows, own-club
highlighting. Tonal surface layering for table header."
```

---

## Task 11: Teams Screen

**Files:**
- Modify: `apps/native/src/app/(tabs)/teams.tsx`

- [ ] **Step 1: Implement Teams screen**

```tsx
// apps/native/src/app/(tabs)/teams.tsx
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import useSWR from "swr";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { TeamCard } from "@/components/TeamCard";
import { useTheme } from "@/hooks/useTheme";
import { publicApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";
import type { PublicTeam } from "@dragons/api-client";

function isYouthTeam(team: PublicTeam): boolean {
  const name = (team.customName || team.name).toLowerCase();
  return /u\d{2}|jugend|mini|bambini/.test(name);
}

export default function TeamsScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const { data, isLoading } = useSWR("teams", () => publicApi.getTeams());

  if (isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 100 }} />
      </Screen>
    );
  }

  const ownTeams = data?.filter((t) => t.isOwnClub) ?? [];
  const seniorTeams = ownTeams.filter((t) => !isYouthTeam(t));
  const youthTeams = ownTeams.filter((t) => isYouthTeam(t));

  const featured = seniorTeams[0];
  const restSenior = seniorTeams.slice(1);

  return (
    <Screen>
      <SectionHeader
        title={i18n.t("teams.title")}
        subtitle={i18n.t("teams.subtitle")}
      />

      {/* Senior Teams */}
      {seniorTeams.length > 0 && (
        <View style={{ marginBottom: 24 }}>
          <SectionHeader title={i18n.t("teams.senior")} />
          {featured && (
            <TeamCard
              team={featured}
              featured
              onPress={() => router.push(`/team/${featured.id}`)}
            />
          )}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            {restSenior.map((team) => (
              <View key={team.id} style={{ flex: 1 }}>
                <TeamCard
                  team={team}
                  onPress={() => router.push(`/team/${team.id}`)}
                />
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Youth Teams */}
      {youthTeams.length > 0 && (
        <View style={{ marginBottom: 24 }}>
          <SectionHeader title={i18n.t("teams.youth")} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {youthTeams.map((team) => (
              <View key={team.id} style={{ width: "48%" }}>
                <TeamCard
                  team={team}
                  onPress={() => router.push(`/team/${team.id}`)}
                />
              </View>
            ))}
          </View>
        </View>
      )}
    </Screen>
  );
}
```

- [ ] **Step 2: Test on simulator**

Navigate to Teams tab. Expected: "OUR TEAMS" header, senior section with featured card + grid, youth section with 2-column grid.

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/app/\(tabs\)/teams.tsx
git commit -m "feat(native): implement Teams screen

Senior/youth team sections with featured hero card, 2-column grid.
Youth detection via team name pattern matching."
```

---

## Task 12: Team Detail and Game Detail Screens

**Files:**
- Modify: `apps/native/src/app/team/[id].tsx`
- Modify: `apps/native/src/app/game/[id].tsx`

- [ ] **Step 1: Implement Team Detail screen**

```tsx
// apps/native/src/app/team/[id].tsx
import { View, Text, FlatList, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import useSWR from "swr";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { MatchCard } from "@/components/MatchCard";
import { SectionHeader } from "@/components/SectionHeader";
import { useTheme } from "@/hooks/useTheme";
import { publicApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";

export default function TeamDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, textStyles } = useTheme();
  const router = useRouter();

  const { data: teamsData } = useSWR("teams", () => publicApi.getTeams());
  const team = teamsData?.find((t) => t.id === Number(id));

  const { data: matchesData, isLoading } = useSWR(
    team ? `team-matches-${team.apiTeamPermanentId}` : null,
    () =>
      publicApi.getMatches({
        teamApiId: team!.apiTeamPermanentId!,
        limit: 50,
      }),
  );

  const { data: standingsData } = useSWR("standings", () =>
    publicApi.getStandings(),
  );

  const teamName = team?.customName || team?.shortName || team?.name || "";
  const matches = matchesData?.data ?? [];
  const today = new Date().toISOString().slice(0, 10);

  const lastMatch = matches
    .filter((m) => m.kickoffDate <= today && m.homeScore !== null)
    .at(-1);
  const nextMatch = matches.find(
    (m) => m.kickoffDate >= today && m.homeScore === null,
  );
  const upcoming = matches.filter(
    (m) => m.kickoffDate >= today,
  );

  // Find this team's standing
  const standing = standingsData
    ?.flatMap((l) => l.standings)
    .find((s) => s.teamId === team?.id);

  return (
    <>
      <Stack.Screen options={{ title: teamName }} />
      <Screen>
        {/* Hero */}
        <View style={{ marginBottom: 24 }}>
          <Text style={[textStyles.screenTitle, { color: colors.foreground }]}>
            {teamName}
          </Text>
          {team?.leagueName && (
            <Text
              style={[
                textStyles.caption,
                { color: colors.mutedForeground, marginTop: 4 },
              ]}
            >
              {team.leagueName}
            </Text>
          )}
          {standing && (
            <Badge
              label={`#${standing.position} · ${standing.won}W ${standing.lost}L`}
              variant="secondary"
            />
          )}
        </View>

        {/* Last Game */}
        {lastMatch && (
          <Card style={{ marginBottom: 16 }}>
            <Badge label={i18n.t("home.lastResult")} />
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 12,
                gap: 12,
              }}
            >
              <Text style={[textStyles.body, { color: colors.foreground, flex: 1, textAlign: "right" }]} numberOfLines={1}>
                {lastMatch.homeTeamName}
              </Text>
              <Text style={[textStyles.score, { color: colors.foreground }]}>
                {lastMatch.homeScore}:{lastMatch.guestScore}
              </Text>
              <Text style={[textStyles.body, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>
                {lastMatch.guestTeamName}
              </Text>
            </View>
          </Card>
        )}

        {/* Next Game */}
        {nextMatch && (
          <Card
            onPress={() => router.push(`/game/${nextMatch.id}`)}
            style={{ marginBottom: 24 }}
          >
            <Badge label={i18n.t("home.nextGame")} variant="heat" />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 12, gap: 12 }}>
              <Text style={[textStyles.body, { color: colors.foreground, flex: 1, textAlign: "right" }]} numberOfLines={1}>
                {nextMatch.homeTeamName}
              </Text>
              <Text style={[textStyles.stat, { color: colors.mutedForeground }]}>{i18n.t("home.vs")}</Text>
              <Text style={[textStyles.body, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>
                {nextMatch.guestTeamName}
              </Text>
            </View>
            <Text style={[textStyles.caption, { color: colors.mutedForeground, textAlign: "center", marginTop: 8 }]}>
              {nextMatch.kickoffDate} {nextMatch.kickoffTime.slice(0, 5)}
            </Text>
          </Card>
        )}

        {/* Upcoming Schedule */}
        {upcoming.length > 0 && (
          <>
            <SectionHeader title={i18n.t("tabs.schedule")} />
            {upcoming.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                onPress={() => router.push(`/game/${match.id}`)}
              />
            ))}
          </>
        )}

        {isLoading && <ActivityIndicator color={colors.primary} />}
      </Screen>
    </>
  );
}
```

- [ ] **Step 2: Implement Game Detail screen**

```tsx
// apps/native/src/app/game/[id].tsx
import { View, Text, ActivityIndicator } from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import useSWR from "swr";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { useTheme } from "@/hooks/useTheme";
import { publicApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";

export default function GameDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, textStyles } = useTheme();

  // Fetch all matches and find by ID (public API doesn't have single-match endpoint)
  const { data, isLoading } = useSWR(`game-${id}`, () =>
    publicApi.getMatches({ limit: 200 }),
  );

  const match = data?.data.find((m) => m.id === Number(id));

  if (isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 100 }} />
      </Screen>
    );
  }

  if (!match) {
    return (
      <Screen>
        <Text style={[textStyles.body, { color: colors.mutedForeground, textAlign: "center", marginTop: 100 }]}>
          Game not found
        </Text>
      </Screen>
    );
  }

  const hasScore = match.homeScore !== null && match.guestScore !== null;

  return (
    <>
      <Stack.Screen options={{ title: `${match.homeTeamName} vs ${match.guestTeamName}` }} />
      <Screen>
        {/* League / Match Day */}
        {match.leagueName && (
          <Badge label={match.leagueName} variant="secondary" />
        )}

        {/* Score or VS */}
        <Card style={{ marginTop: 16, marginBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16 }}>
            <Text
              style={[textStyles.cardTitle, { color: colors.foreground, flex: 1, textAlign: "right" }]}
              numberOfLines={2}
            >
              {match.homeTeamName}
            </Text>
            {hasScore ? (
              <Text style={[textStyles.score, { color: colors.foreground }]}>
                {match.homeScore}:{match.guestScore}
              </Text>
            ) : (
              <Text style={[textStyles.stat, { color: colors.mutedForeground }]}>
                {i18n.t("home.vs")}
              </Text>
            )}
            <Text
              style={[textStyles.cardTitle, { color: colors.foreground, flex: 1 }]}
              numberOfLines={2}
            >
              {match.guestTeamName}
            </Text>
          </View>
        </Card>

        {/* Match Info */}
        <Card>
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>Date</Text>
              <Text style={[textStyles.body, { color: colors.foreground }]}>
                {match.kickoffDate} {match.kickoffTime.slice(0, 5)}
              </Text>
            </View>
            {match.venueName && (
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>Venue</Text>
                <Text style={[textStyles.body, { color: colors.foreground }]}>
                  {match.venueName}
                </Text>
              </View>
            )}
            {match.status && match.status !== "confirmed" && (
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>Status</Text>
                <Badge
                  label={match.status.toUpperCase()}
                  variant={match.status === "cancelled" ? "destructive" : "heat"}
                />
              </View>
            )}
          </View>
        </Card>
      </Screen>
    </>
  );
}
```

- [ ] **Step 3: Test on simulator**

Navigate to Teams > tap a team > tap a match. Expected: Team detail shows hero, last/next game, schedule. Game detail shows score/VS, date, venue, status.

- [ ] **Step 4: Commit**

```bash
git add apps/native/src/app/team/ apps/native/src/app/game/
git commit -m "feat(native): implement Team Detail and Game Detail screens

Team Detail: hero, standings position, last/next game, upcoming schedule.
Game Detail: deep link target with score, venue, match info."
```

---

## Task 13: Auth Screens (Sign In, Sign Up, Profile)

**Files:**
- Modify: `apps/native/src/app/(auth)/sign-in.tsx`
- Modify: `apps/native/src/app/(auth)/sign-up.tsx`
- Modify: `apps/native/src/app/profile.tsx`

- [ ] **Step 1: Implement Sign In screen**

```tsx
// apps/native/src/app/(auth)/sign-in.tsx
import { useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { authClient } from "@/lib/auth-client";
import { i18n } from "@/lib/i18n";

export default function SignInScreen() {
  const { colors, textStyles, radius: r } = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const inputStyle = {
    backgroundColor: colors.input,
    borderRadius: r.md,
    borderWidth: 1,
    borderColor: `${colors.border}33`, // 20% opacity
    padding: 16,
    color: colors.foreground,
    fontFamily: "Inter-Regular",
    fontSize: 15,
    marginBottom: 12,
  };

  async function handleSignIn() {
    setLoading(true);
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        Alert.alert("Error", result.error.message);
      } else {
        router.dismissAll();
        router.replace("/");
      }
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 24, justifyContent: "center" }}>
      <Text style={[textStyles.screenTitle, { color: colors.foreground, textAlign: "center", marginBottom: 32 }]}>
        DRAGONS
      </Text>

      <TextInput
        style={inputStyle}
        placeholder={i18n.t("auth.email")}
        placeholderTextColor={colors.mutedForeground}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />

      <TextInput
        style={inputStyle}
        placeholder={i18n.t("auth.password")}
        placeholderTextColor={colors.mutedForeground}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
      />

      <Pressable
        onPress={handleSignIn}
        disabled={loading}
        style={{
          backgroundColor: colors.primary,
          borderRadius: r.md,
          padding: 16,
          alignItems: "center",
          opacity: loading ? 0.7 : 1,
          marginTop: 8,
        }}
      >
        <Text style={[textStyles.button, { color: colors.primaryForeground }]}>
          {i18n.t("auth.signIn")}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("/(auth)/sign-up")}
        style={{ marginTop: 16, alignItems: "center" }}
      >
        <Text style={[textStyles.body, { color: colors.primary }]}>
          {i18n.t("auth.noAccount")}
        </Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 2: Implement Sign Up screen**

```tsx
// apps/native/src/app/(auth)/sign-up.tsx
import { useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { authClient } from "@/lib/auth-client";
import { i18n } from "@/lib/i18n";

export default function SignUpScreen() {
  const { colors, textStyles, radius: r } = useTheme();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const inputStyle = {
    backgroundColor: colors.input,
    borderRadius: r.md,
    borderWidth: 1,
    borderColor: `${colors.border}33`,
    padding: 16,
    color: colors.foreground,
    fontFamily: "Inter-Regular",
    fontSize: 15,
    marginBottom: 12,
  };

  async function handleSignUp() {
    setLoading(true);
    try {
      const result = await authClient.signUp.email({ name, email, password });
      if (result.error) {
        Alert.alert("Error", result.error.message);
      } else {
        router.dismissAll();
        router.replace("/");
      }
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 24, justifyContent: "center" }}>
      <Text style={[textStyles.screenTitle, { color: colors.foreground, textAlign: "center", marginBottom: 32 }]}>
        DRAGONS
      </Text>

      <TextInput
        style={inputStyle}
        placeholder={i18n.t("auth.name")}
        placeholderTextColor={colors.mutedForeground}
        value={name}
        onChangeText={setName}
        autoComplete="name"
      />

      <TextInput
        style={inputStyle}
        placeholder={i18n.t("auth.email")}
        placeholderTextColor={colors.mutedForeground}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />

      <TextInput
        style={inputStyle}
        placeholder={i18n.t("auth.password")}
        placeholderTextColor={colors.mutedForeground}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
      />

      <Pressable
        onPress={handleSignUp}
        disabled={loading}
        style={{
          backgroundColor: colors.primary,
          borderRadius: r.md,
          padding: 16,
          alignItems: "center",
          opacity: loading ? 0.7 : 1,
          marginTop: 8,
        }}
      >
        <Text style={[textStyles.button, { color: colors.primaryForeground }]}>
          {i18n.t("auth.signUp")}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.back()}
        style={{ marginTop: 16, alignItems: "center" }}
      >
        <Text style={[textStyles.body, { color: colors.primary }]}>
          {i18n.t("auth.hasAccount")}
        </Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 3: Implement Profile screen**

```tsx
// apps/native/src/app/profile.tsx
import { View, Text, Pressable, Switch, Alert } from "react-native";
import { useRouter, Stack } from "expo-router";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { SectionHeader } from "@/components/SectionHeader";
import { useTheme } from "@/hooks/useTheme";
import { authClient } from "@/lib/auth-client";
import { i18n } from "@/lib/i18n";

export default function ProfileScreen() {
  const { colors, textStyles, radius: r, mode, setMode } = useTheme();
  const router = useRouter();
  const { data: session } = authClient.useSession();

  if (!session) {
    // Not logged in — show sign-in prompt
    return (
      <>
        <Stack.Screen options={{ title: i18n.t("profile.title") }} />
        <Screen>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 100 }}>
            <Text style={[textStyles.body, { color: colors.mutedForeground, marginBottom: 16 }]}>
              Sign in to access your profile
            </Text>
            <Pressable
              onPress={() => router.push("/(auth)/sign-in")}
              style={{
                backgroundColor: colors.primary,
                borderRadius: r.md,
                paddingHorizontal: 24,
                paddingVertical: 12,
              }}
            >
              <Text style={[textStyles.button, { color: colors.primaryForeground }]}>
                {i18n.t("auth.signIn")}
              </Text>
            </Pressable>
          </View>
        </Screen>
      </>
    );
  }

  async function handleSignOut() {
    await authClient.signOut();
    router.replace("/");
  }

  return (
    <>
      <Stack.Screen options={{ title: i18n.t("profile.title") }} />
      <Screen>
        {/* User Info */}
        <Card style={{ marginBottom: 24 }}>
          <Text style={[textStyles.cardTitle, { color: colors.foreground }]}>
            {session.user.name || session.user.email}
          </Text>
          <Text style={[textStyles.caption, { color: colors.mutedForeground, marginTop: 4 }]}>
            {session.user.email}
          </Text>
          {session.user.role && (
            <Badge label={session.user.role.toUpperCase()} variant="secondary" />
          )}
        </Card>

        {/* Theme */}
        <SectionHeader title={i18n.t("profile.theme")} />
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 24 }}>
          {(["system", "light", "dark"] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={{
                flex: 1,
                backgroundColor: mode === m ? colors.primary : colors.surfaceHigh,
                borderRadius: r.md,
                padding: 12,
                alignItems: "center",
              }}
            >
              <Text
                style={[
                  textStyles.label,
                  {
                    color: mode === m ? colors.primaryForeground : colors.mutedForeground,
                  },
                ]}
              >
                {i18n.t(`profile.theme${m.charAt(0).toUpperCase()}${m.slice(1)}`)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Sign Out */}
        <Pressable
          onPress={handleSignOut}
          style={{
            backgroundColor: `${colors.destructive}1A`, // 10% opacity
            borderRadius: r.md,
            padding: 16,
            alignItems: "center",
          }}
        >
          <Text style={[textStyles.button, { color: colors.destructive }]}>
            {i18n.t("profile.signOut")}
          </Text>
        </Pressable>
      </Screen>
    </>
  );
}
```

- [ ] **Step 4: Test on simulator**

Tap profile icon in header > sign in > verify session persists > profile shows user info + theme toggle + sign out.

- [ ] **Step 5: Commit**

```bash
git add apps/native/src/app/
git commit -m "feat(native): implement auth screens and profile

Sign In, Sign Up with Better Auth Expo plugin. Profile with
user info, theme toggle (system/light/dark), sign out."
```

---

## Task 14: Push Notifications and Deep Linking

**Files:**
- Create: `apps/native/src/hooks/usePushNotifications.ts`
- Modify: `apps/native/src/app/_layout.tsx`

- [ ] **Step 1: Create push notification hook**

```typescript
// apps/native/src/hooks/usePushNotifications.ts
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { deviceApi } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function usePushNotifications() {
  const router = useRouter();
  const notificationResponseListener = useRef<Notifications.EventSubscription>();
  const { data: session } = authClient.useSession();

  useEffect(() => {
    if (!session) return;

    async function register() {
      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") return;

      const tokenData = await Notifications.getExpoPushTokenAsync();
      const platform = Platform.OS === "ios" ? "ios" : "android";

      try {
        await deviceApi.register(tokenData.data, platform);
      } catch {
        // Silently fail — device registration is non-critical
      }
    }

    register();
  }, [session]);

  // Handle notification tap → deep link
  useEffect(() => {
    notificationResponseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const url = response.notification.request.content.data?.url;
        if (typeof url === "string") {
          router.push(url as never);
        }
      });

    return () => {
      if (notificationResponseListener.current) {
        Notifications.removeNotificationSubscription(
          notificationResponseListener.current,
        );
      }
    };
  }, [router]);
}
```

- [ ] **Step 2: Wire push notifications into root layout**

Add to the `RootNavigator` component in `apps/native/src/app/_layout.tsx`:

```tsx
// In RootNavigator function, add:
import { usePushNotifications } from "@/hooks/usePushNotifications";

function RootNavigator() {
  const { colors, isDark } = useTheme();
  usePushNotifications();

  // ... rest of the component
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/hooks/usePushNotifications.ts apps/native/src/app/_layout.tsx
git commit -m "feat(native): add push notification registration and deep link handling

Register Expo push token on auth, handle notification tap to
navigate to deep link URL. Uses expo-notifications."
```

---

## Task 15: Biometric Lock

**Files:**
- Create: `apps/native/src/hooks/useBiometricLock.ts`
- Modify: `apps/native/src/app/_layout.tsx`
- Modify: `apps/native/src/app/profile.tsx`

- [ ] **Step 1: Create biometric lock hook**

```typescript
// apps/native/src/hooks/useBiometricLock.ts
import { useState, useEffect, useCallback } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const BIOMETRIC_KEY = "biometric_lock_enabled";

export function useBiometricLock() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    async function init() {
      const supported = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setIsSupported(supported && enrolled);

      const stored = await SecureStore.getItemAsync(BIOMETRIC_KEY);
      const enabled = stored === "true";
      setIsEnabled(enabled);
      setIsLocked(enabled); // Start locked if enabled
    }
    init();
  }, []);

  const authenticate = useCallback(async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock Dragons",
      fallbackLabel: "Use passcode",
      disableDeviceFallback: false,
    });
    if (result.success) {
      setIsLocked(false);
    }
    return result.success;
  }, []);

  const toggle = useCallback(async () => {
    const newValue = !isEnabled;
    if (newValue) {
      // Verify biometric works before enabling
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Enable biometric lock",
        disableDeviceFallback: false,
      });
      if (!result.success) return;
    }
    await SecureStore.setItemAsync(BIOMETRIC_KEY, String(newValue));
    setIsEnabled(newValue);
    setIsLocked(false);
  }, [isEnabled]);

  return { isEnabled, isLocked, isSupported, authenticate, toggle };
}
```

- [ ] **Step 2: Add biometric gate to root layout**

Update `RootLayout` in `apps/native/src/app/_layout.tsx` to check biometric lock:

```tsx
import { useBiometricLock } from "@/hooks/useBiometricLock";

// In RootLayout, after font loading:
export default function RootLayout() {
  const [fontsLoaded] = useFonts(fontAssets);
  const biometric = useBiometricLock();

  useEffect(() => {
    if (fontsLoaded) {
      if (biometric.isLocked) {
        biometric.authenticate().then(() => SplashScreen.hideAsync());
      } else {
        SplashScreen.hideAsync();
      }
    }
  }, [fontsLoaded, biometric.isLocked]);

  if (!fontsLoaded || biometric.isLocked) {
    return null;
  }

  return (
    <ThemeProvider>
      <RootNavigator />
    </ThemeProvider>
  );
}
```

- [ ] **Step 3: Add biometric toggle to Profile screen**

In `apps/native/src/app/profile.tsx`, add between the theme section and sign-out button:

```tsx
import { Switch } from "react-native";
import { useBiometricLock } from "@/hooks/useBiometricLock";

// Inside ProfileScreen, add the hook:
const biometric = useBiometricLock();

// Add this JSX block before the Sign Out button:
{biometric.isSupported && (
  <View style={{ marginBottom: 24 }}>
    <SectionHeader title={i18n.t("profile.biometricLock")} />
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: colors.surfaceLowest,
        borderRadius: r.md,
        padding: 16,
      }}
    >
      <Text style={[textStyles.body, { color: colors.foreground }]}>
        {i18n.t("profile.biometricLock")}
      </Text>
      <Switch
        value={biometric.isEnabled}
        onValueChange={() => biometric.toggle()}
        trackColor={{ true: colors.primary, false: colors.surfaceHigh }}
        thumbColor={colors.primaryForeground}
      />
    </View>
  </View>
)}
```

- [ ] **Step 4: Test on simulator**

Profile > toggle biometric lock > restart app > Face ID / fingerprint prompt appears.
Note: iOS Simulator supports simulated Face ID via Features > Face ID > Enrolled.

- [ ] **Step 5: Commit**

```bash
git add apps/native/src/hooks/useBiometricLock.ts apps/native/src/app/_layout.tsx apps/native/src/app/profile.tsx
git commit -m "feat(native): add biometric lock

Face ID / fingerprint lock with toggle in Profile. Locks app on
launch when enabled, falls back to device passcode."
```

---

## Task 16: Final Verification and Cleanup

**Files:**
- Verify all screens work end-to-end
- Run typecheck across monorepo

- [ ] **Step 1: Run monorepo typecheck**

Run: `pnpm typecheck`
Expected: All packages pass. Fix any type errors.

- [ ] **Step 2: Run api-client tests**

Run: `pnpm --filter @dragons/api-client test`
Expected: All tests pass.

- [ ] **Step 3: Verify on iOS simulator**

Run: `cd apps/native && npx expo start`, press `i`.

Verify each screen:
1. Home tab — next game card, last result, stat strip
2. Schedule tab — filter pills, match cards grouped by date
3. Tables tab — standings table with own-club highlight
4. Teams tab — senior/youth sections, team cards
5. Team detail — tap a team, see hero + schedule
6. Game detail — tap a match, see score/venue
7. Profile — tap avatar icon, sign in, see profile, theme toggle

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(native): complete Expo mobile app MVP

Public-only MVP with Home, Schedule, Standings, Teams, Team Detail,
Game Detail screens. Dragon's Lair design system ported to React
Native. Better Auth Expo integration, push notifications, biometric
lock. Shared types via @dragons/shared and @dragons/api-client."
```
