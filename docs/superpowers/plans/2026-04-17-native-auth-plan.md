# Native Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship referee-only sign-in on the Expo Router native app, with the Referee tab mounted conditionally on the signed-in user's role and a cleaned-up sign-in screen.

**Architecture:** Single dynamic tab in `(tabs)/_layout.tsx` gated by `authClient.useSession()`. New `(tabs)/referee.tsx` screen fetches `/referee/games` via a new `refereeEndpoints` wrapper in `@dragons/api-client`. `ApiClient` gains an `onResponse` hook to sign the user out on 401. Sign-up and password-recovery are intentionally excluded.

**Tech Stack:** Expo Router (unstable NativeTabs), `better-auth/react` + `@better-auth/expo`, `expo-secure-store`, SWR, `@dragons/api-client` (Fetch-based), Vitest for api-client tests. No automated test harness exists for `apps/native` yet — native-side verification is manual.

**Spec reference:** `docs/superpowers/specs/2026-04-17-native-auth-design.md`

---

## File-touch map

**Create:**
- `packages/api-client/src/endpoints/referee.ts`
- `apps/native/src/app/(tabs)/referee.tsx`

**Modify:**
- `packages/api-client/src/client.ts` — add `onResponse` option, invoke on every response
- `packages/api-client/src/client.test.ts` — test `onResponse` hook
- `packages/api-client/src/endpoints/index.ts` — re-export referee endpoints
- `packages/api-client/src/endpoints/referee.test.ts` — NEW, tests the new endpoint
- `packages/api-client/src/index.ts` — top-level re-export
- `apps/native/src/lib/api.ts` — wire `onResponse` to call `authClient.signOut()` on 401; export `refereeApi`
- `apps/native/src/app/_layout.tsx` — extend splash gate with `useSession().isPending`
- `apps/native/src/app/(tabs)/_layout.tsx` — conditional Referee trigger + bounce effect
- `apps/native/src/app/(auth)/sign-in.tsx` — inline errors, disabled submit, password-manager hints, close button, drop sign-up link
- `apps/native/src/app/profile.tsx` — staff-framed anon copy + role-gated badge
- `apps/native/src/i18n/en.json` — add/remove keys
- `apps/native/src/i18n/de.json` — add/remove keys

**Delete:**
- `apps/native/src/app/(auth)/sign-up.tsx`

---

## Prerequisites (engineer checklist)

- Run `docker compose -f docker/docker-compose.dev.yml up -d` to have Postgres + Redis for `pnpm dev` if you intend to test end-to-end.
- Seed a referee user: sign up as `user` in the web app, then an admin promotes the account via the admin UI or DB: `UPDATE "user" SET role = 'referee', referee_id = <id> WHERE email = '...';`. Linking to a real `referee_id` is required for non-admin referees per `apps/api/src/routes/referee/games.routes.ts:37`.
- Keep an iOS simulator and Android emulator available for manual QA at the end. If only one platform is available, skip the other's checklist items but note it in the PR.

---

## Task 1: Add `onResponse` hook to ApiClient

**Purpose:** Let callers react to every HTTP response (e.g. to sign out on 401) without subclassing the client.

**Files:**
- Modify: `packages/api-client/src/client.ts`
- Modify: `packages/api-client/src/client.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/api-client/src/client.test.ts` (append inside the existing `describe` block — do not remove existing tests):

```ts
it("invokes onResponse for every response", async () => {
  const seen: number[] = [];
  const mockFetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  const client = new ApiClient({
    baseUrl: "https://example.test",
    fetchFn: mockFetch as unknown as typeof fetch,
    onResponse: (res) => {
      seen.push(res.status);
    },
  });

  await client.get("/ping");

  expect(seen).toEqual([200]);
});

it("invokes onResponse even on error responses", async () => {
  const seen: number[] = [];
  const mockFetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ code: "UNAUTHORIZED", message: "no" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }),
  );
  const client = new ApiClient({
    baseUrl: "https://example.test",
    fetchFn: mockFetch as unknown as typeof fetch,
    onResponse: (res) => {
      seen.push(res.status);
    },
  });

  await expect(client.get("/ping")).rejects.toThrow();
  expect(seen).toEqual([401]);
});

it("awaits async onResponse before returning", async () => {
  const events: string[] = [];
  const mockFetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  const client = new ApiClient({
    baseUrl: "https://example.test",
    fetchFn: mockFetch as unknown as typeof fetch,
    onResponse: async () => {
      await new Promise((r) => setTimeout(r, 5));
      events.push("hook");
    },
  });

  await client.get("/ping");
  events.push("after-get");
  expect(events).toEqual(["hook", "after-get"]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @dragons/api-client test`

Expected: three new tests fail. Existing tests continue to pass.

- [ ] **Step 3: Add the hook to `ApiClient`**

Edit `packages/api-client/src/client.ts`:

```ts
import { APIError } from "./errors";
import { buildQueryString } from "./query-string";

export interface AuthStrategy {
  getHeaders(): Record<string, string> | Promise<Record<string, string>>;
}

export interface ApiClientOptions {
  baseUrl: string;
  auth?: AuthStrategy;
  fetchFn?: typeof fetch;
  credentials?: RequestCredentials;
  /**
   * Called for every response before the client parses the body.
   * Errors thrown from the hook are not caught — keep it defensive.
   */
  onResponse?: (response: Response) => void | Promise<void>;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly auth?: AuthStrategy;
  private readonly fetchFn: typeof fetch;
  private readonly credentials?: RequestCredentials;
  private readonly onResponse?: (response: Response) => void | Promise<void>;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.auth = options.auth;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.credentials = options.credentials;
    this.onResponse = options.onResponse;
  }

  async get<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    return this.request<T>("GET", path, params);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, undefined, body);
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, undefined, body);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  private async request<T>(
    method: string,
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
    body?: unknown,
  ): Promise<T> {
    const qs = params ? buildQueryString(params) : "";
    const url = `${this.baseUrl}${path}${qs}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (this.auth) {
      const authHeaders = await this.auth.getHeaders();
      Object.assign(headers, authHeaders);
    }

    const init: RequestInit = {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    };
    if (this.credentials) {
      init.credentials = this.credentials;
    }
    const response = await this.fetchFn(url, init);

    if (this.onResponse) {
      await this.onResponse(response);
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const errorRecord = errorBody as Record<string, unknown>;
      throw new APIError(
        response.status,
        (errorRecord["code"] as string) ?? "UNKNOWN_ERROR",
        (errorRecord["message"] as string) ?? response.statusText,
      );
    }

    return (await response.json()) as T;
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @dragons/api-client test`

Expected: all tests pass, including the three new ones.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @dragons/api-client typecheck`

Expected: no errors. (If the package has no `typecheck` script, use `pnpm -w typecheck` or `pnpm --filter @dragons/api-client lint`.)

- [ ] **Step 6: Commit**

```bash
git add packages/api-client/src/client.ts packages/api-client/src/client.test.ts
git commit -m "feat(api-client): add onResponse hook to ApiClient"
```

---

## Task 2: Add refereeEndpoints to api-client

**Purpose:** Give native a typed wrapper for `/referee/games` so it mirrors the web's usage.

**Files:**
- Create: `packages/api-client/src/endpoints/referee.ts`
- Create: `packages/api-client/src/endpoints/referee.test.ts`
- Modify: `packages/api-client/src/endpoints/index.ts`
- Modify: `packages/api-client/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/api-client/src/endpoints/referee.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { ApiClient } from "../client";
import { refereeEndpoints } from "./referee";

describe("refereeEndpoints", () => {
  it("GETs /referee/games with default params", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ items: [], total: 0, limit: 100, offset: 0, hasMore: false }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const client = new ApiClient({
      baseUrl: "https://example.test",
      fetchFn: mockFetch as unknown as typeof fetch,
    });
    const api = refereeEndpoints(client);

    const result = await api.getGames();

    expect(mockFetch).toHaveBeenCalledOnce();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe("https://example.test/referee/games");
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("passes query params when supplied", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ items: [], total: 0, limit: 50, offset: 10, hasMore: false }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const client = new ApiClient({
      baseUrl: "https://example.test",
      fetchFn: mockFetch as unknown as typeof fetch,
    });
    const api = refereeEndpoints(client);

    await api.getGames({ limit: 50, offset: 10, status: "active" });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/referee/games?");
    expect(url).toContain("limit=50");
    expect(url).toContain("offset=10");
    expect(url).toContain("status=active");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @dragons/api-client test`

Expected: import of `./referee` fails (module not found).

- [ ] **Step 3: Create the endpoint module**

Create `packages/api-client/src/endpoints/referee.ts`:

```ts
import type { PaginatedResponse, RefereeGameListItem } from "@dragons/shared";
import type { ApiClient } from "../client";

export interface RefereeGamesQueryParams {
  limit?: number;
  offset?: number;
  search?: string;
  status?: "active" | "cancelled" | "forfeited" | "all";
  league?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function refereeEndpoints(client: ApiClient) {
  return {
    getGames(
      params?: RefereeGamesQueryParams,
    ): Promise<PaginatedResponse<RefereeGameListItem>> {
      return client.get(
        "/referee/games",
        params as Record<string, string | number | boolean | undefined>,
      );
    },
  };
}
```

- [ ] **Step 4: Wire it through the endpoints barrel**

Edit `packages/api-client/src/endpoints/index.ts`:

```ts
export { publicEndpoints } from "./public";
export type { MatchQueryParams, PublicTeam } from "./public";

export { deviceEndpoints } from "./devices";
export type { RegisterDeviceResponse, UnregisterDeviceResponse } from "./devices";

export { refereeEndpoints } from "./referee";
export type { RefereeGamesQueryParams } from "./referee";
```

Edit `packages/api-client/src/index.ts`:

```ts
export { ApiClient } from "./client";
export type { AuthStrategy, ApiClientOptions } from "./client";

export { APIError } from "./errors";

export { buildQueryString } from "./query-string";

export {
  publicEndpoints,
  deviceEndpoints,
  refereeEndpoints,
} from "./endpoints";
export type {
  MatchQueryParams,
  PublicTeam,
  RegisterDeviceResponse,
  UnregisterDeviceResponse,
  RefereeGamesQueryParams,
} from "./endpoints";
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @dragons/api-client test`

Expected: all tests pass.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @dragons/api-client typecheck` (or the workspace-level `pnpm typecheck`).

Expected: no errors. If you get "Cannot find module '@dragons/shared'", make sure `@dragons/shared` is listed in `packages/api-client/package.json` dependencies; add it if missing.

- [ ] **Step 7: Commit**

```bash
git add packages/api-client/src/endpoints/referee.ts packages/api-client/src/endpoints/referee.test.ts packages/api-client/src/endpoints/index.ts packages/api-client/src/index.ts
git commit -m "feat(api-client): add refereeEndpoints for /referee/games"
```

---

## Task 3: Wire `onResponse` and `refereeApi` in native api.ts

**Purpose:** Native sees 401s as a signal to drop the local session, and can call `refereeApi.getGames()`.

**Files:**
- Modify: `apps/native/src/lib/api.ts`

- [ ] **Step 1: Rewrite the file**

Replace the contents of `apps/native/src/lib/api.ts` with:

```ts
import {
  ApiClient,
  publicEndpoints,
  deviceEndpoints,
  refereeEndpoints,
} from "@dragons/api-client";
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
      return {} as Record<string, string>;
    },
  },
  onResponse: async (response) => {
    if (response.status === 401) {
      await authClient.signOut().catch(() => {});
    }
  },
});

export const publicApi = publicEndpoints(apiClient);
export const deviceApi = deviceEndpoints(apiClient);
export const refereeApi = refereeEndpoints(apiClient);
```

- [ ] **Step 2: Typecheck native**

Run: `pnpm --filter @dragons/native typecheck`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/lib/api.ts
git commit -m "feat(native): wire 401 sign-out and expose refereeApi"
```

---

## Task 4: Update i18n (en + de)

**Purpose:** Copy strings for the new UI land together so later tasks compile without missing keys.

**Files:**
- Modify: `apps/native/src/i18n/en.json`
- Modify: `apps/native/src/i18n/de.json`

- [ ] **Step 1: Replace `en.json`**

Overwrite `apps/native/src/i18n/en.json` with:

```json
{
  "tabs": {
    "home": "Home",
    "schedule": "Schedule",
    "standings": "Standings",
    "teams": "Teams",
    "referee": "Referee"
  },
  "home": {
    "nextGame": "Next Game",
    "lastResult": "Last Result",
    "recentResults": "Recent Results",
    "upcomingGames": "Upcoming Games",
    "vs": "vs",
    "noUpcoming": "No upcoming games",
    "countdown": {
      "today": "Today",
      "tomorrow": "Tomorrow",
      "inDays": "In %{count} days"
    },
    "stats": {
      "teams": "Teams",
      "wins": "Wins",
      "losses": "Losses",
      "winRate": "Win %"
    }
  },
  "match": {
    "win": "W",
    "loss": "L",
    "upcoming": "Up",
    "cancelled": "Canc.",
    "forfeited": "Forf."
  },
  "schedule": {
    "title": "Schedule",
    "upcoming": "Upcoming",
    "results": "Results",
    "homeOnly": "Home",
    "away": "Away",
    "noMatches": "No matches found"
  },
  "standings": {
    "title": "Standings",
    "pos": "Pos",
    "team": "Team",
    "played": "GP",
    "won": "W",
    "lost": "L",
    "diff": "Diff",
    "points": "Pts"
  },
  "teams": {
    "title": "Teams",
    "subtitle": "All teams at a glance",
    "senior": "Senior",
    "youth": "Youth"
  },
  "profile": {
    "title": "Profile",
    "biometricLock": "Biometric Lock",
    "theme": "Appearance",
    "themeSystem": "System",
    "themeLight": "Light",
    "themeDark": "Dark",
    "signOut": "Sign Out"
  },
  "teamDetail": {
    "league": "League",
    "lastGame": "Last Game",
    "nextGame": "Next Game",
    "upcoming": "Upcoming",
    "noMatches": "No matches found",
    "position": "Pos",
    "season": "Season",
    "games": "Games",
    "wins": "Wins",
    "losses": "Losses",
    "diff": "Diff",
    "standings": "Standings",
    "allGames": "All Games"
  },
  "gameDetail": {
    "venue": "Venue",
    "address": "Address",
    "date": "Date",
    "time": "Time",
    "final": "Final",
    "quarters": "Quarters",
    "halftime": "HT",
    "total": "Tot",
    "record": "Record vs %{opponent}",
    "form": "Form (last 5)",
    "details": "Details",
    "scorer": "Scorer",
    "timekeeper": "Timekeeper",
    "status": "Status",
    "confirmed": "Confirmed",
    "cancelled": "Cancelled",
    "forfeited": "Forfeited",
    "previousMeetings": "Previous Meetings",
    "pointsFor": "Points for",
    "pointsAgainst": "Points against",
    "home": "Home"
  },
  "h2h": {
    "title": "Record vs %{opponent}"
  },
  "refereeTab": {
    "title": "My Assignments",
    "empty": "No upcoming assignments",
    "error": "Couldn't load assignments",
    "retry": "Retry"
  },
  "auth": {
    "signIn": "Sign In",
    "signOut": "Sign Out",
    "email": "Email",
    "password": "Password",
    "error": "Error",
    "signInFailed": "Sign In Failed",
    "unknownError": "Unknown error",
    "unexpectedError": "An unexpected error occurred",
    "invalidCredentials": "Invalid email or password",
    "staffSignInPrompt": "Sign in as referee or admin",
    "staffSignInHint": "Fans don't need an account to use the app.",
    "tapToUnlock": "Tap to unlock",
    "close": "Close"
  },
  "common": {
    "home": "Home",
    "away": "Away",
    "details": "Details",
    "cancel": "Cancel",
    "save": "Save",
    "loading": "Loading…",
    "vs": "vs",
    "at": "@"
  }
}
```

- [ ] **Step 2: Replace `de.json`**

Overwrite `apps/native/src/i18n/de.json` with:

```json
{
  "tabs": {
    "home": "Start",
    "schedule": "Spielplan",
    "standings": "Tabelle",
    "teams": "Teams",
    "referee": "Schiri"
  },
  "home": {
    "nextGame": "Nächstes Spiel",
    "lastResult": "Letztes Ergebnis",
    "recentResults": "Letzte Ergebnisse",
    "upcomingGames": "Kommende Spiele",
    "vs": "vs",
    "noUpcoming": "Keine anstehenden Spiele",
    "countdown": {
      "today": "Heute",
      "tomorrow": "Morgen",
      "inDays": "In %{count} Tagen"
    },
    "stats": {
      "teams": "Teams",
      "wins": "Siege",
      "losses": "Niederlagen",
      "winRate": "Siegquote"
    }
  },
  "match": {
    "win": "S",
    "loss": "N",
    "upcoming": "Anst.",
    "cancelled": "Abg.",
    "forfeited": "Wert."
  },
  "schedule": {
    "title": "Spielplan",
    "upcoming": "Anstehend",
    "results": "Ergebnisse",
    "homeOnly": "Heim",
    "away": "Auswärts",
    "noMatches": "Keine Spiele gefunden"
  },
  "standings": {
    "title": "Tabellen",
    "pos": "Pl.",
    "team": "Team",
    "played": "Sp",
    "won": "S",
    "lost": "N",
    "diff": "Diff",
    "points": "Pkt"
  },
  "teams": {
    "title": "Mannschaften",
    "subtitle": "Alle Teams im Überblick",
    "senior": "Senioren",
    "youth": "Jugend"
  },
  "profile": {
    "title": "Profil",
    "biometricLock": "Biometrische Sperre",
    "theme": "Darstellung",
    "themeSystem": "System",
    "themeLight": "Hell",
    "themeDark": "Dunkel",
    "signOut": "Abmelden"
  },
  "teamDetail": {
    "league": "Liga",
    "lastGame": "Letztes Spiel",
    "nextGame": "Nächstes Spiel",
    "upcoming": "Kommende Spiele",
    "noMatches": "Keine Spiele gefunden",
    "position": "Platz",
    "season": "Saison",
    "games": "Spiele",
    "wins": "Siege",
    "losses": "Niederl.",
    "diff": "Diff",
    "standings": "Tabelle",
    "allGames": "Alle Spiele"
  },
  "gameDetail": {
    "venue": "Halle",
    "address": "Adresse",
    "date": "Datum",
    "time": "Uhrzeit",
    "final": "Endstand",
    "quarters": "Viertel",
    "halftime": "HZ",
    "total": "Ges",
    "record": "Bilanz vs %{opponent}",
    "form": "Form (letzte 5)",
    "details": "Details",
    "scorer": "Anschreiber",
    "timekeeper": "Zeitnehmer",
    "status": "Status",
    "confirmed": "Bestätigt",
    "cancelled": "Abgesagt",
    "forfeited": "Kampflos",
    "previousMeetings": "Letzte Begegnungen",
    "pointsFor": "Punkte für",
    "pointsAgainst": "Punkte gegen",
    "home": "Heim"
  },
  "h2h": {
    "title": "Bilanz vs %{opponent}"
  },
  "refereeTab": {
    "title": "Meine Einsätze",
    "empty": "Keine bevorstehenden Einsätze",
    "error": "Einsätze konnten nicht geladen werden",
    "retry": "Erneut versuchen"
  },
  "auth": {
    "signIn": "Anmelden",
    "signOut": "Abmelden",
    "email": "E-Mail",
    "password": "Passwort",
    "error": "Fehler",
    "signInFailed": "Anmeldung fehlgeschlagen",
    "unknownError": "Unbekannter Fehler",
    "unexpectedError": "Ein unerwarteter Fehler ist aufgetreten",
    "invalidCredentials": "Ungültige E-Mail oder Passwort",
    "staffSignInPrompt": "Als Schiedsrichter oder Admin anmelden",
    "staffSignInHint": "Als Fan brauchst du kein Konto.",
    "tapToUnlock": "Tippen zum Entsperren",
    "close": "Schließen"
  },
  "common": {
    "home": "Heim",
    "away": "Auswärts",
    "details": "Details",
    "cancel": "Abbrechen",
    "save": "Speichern",
    "loading": "Laden…",
    "vs": "vs",
    "at": "@"
  }
}
```

- [ ] **Step 3: Verify JSON parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('apps/native/src/i18n/en.json','utf8'));JSON.parse(require('fs').readFileSync('apps/native/src/i18n/de.json','utf8'));console.log('ok')"`

Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add apps/native/src/i18n/en.json apps/native/src/i18n/de.json
git commit -m "feat(native): add referee + staff auth i18n, drop sign-up keys"
```

---

## Task 5: Delete sign-up screen

**Purpose:** Remove the dead sign-up route and sever its reachability.

**Files:**
- Delete: `apps/native/src/app/(auth)/sign-up.tsx`

- [ ] **Step 1: Delete the file**

```bash
rm apps/native/src/app/(auth)/sign-up.tsx
```

- [ ] **Step 2: Grep for remaining references**

Use Grep: pattern `sign-up`, path `apps/native`.

Expected: the only remaining hit is the link inside `apps/native/src/app/(auth)/sign-in.tsx` (we'll remove it in Task 6). If you see anywhere else still referencing `(auth)/sign-up`, remove it.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @dragons/native typecheck`

Expected: no errors. (The sign-in link doesn't cause a type error because `router.push` takes a string.)

- [ ] **Step 4: Commit**

```bash
git add -A apps/native/src/app/\(auth\)/
git commit -m "chore(native): remove sign-up screen"
```

---

## Task 6: Polish the sign-in screen

**Purpose:** Inline errors, disabled submit, password-manager hints, close button, drop the sign-up link.

**Files:**
- Modify: `apps/native/src/app/(auth)/sign-in.tsx`

- [ ] **Step 1: Rewrite the file**

Replace `apps/native/src/app/(auth)/sign-in.tsx` contents with:

```tsx
import { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { authClient } from "@/lib/auth-client";
import { i18n } from "@/lib/i18n";

export default function SignInScreen() {
  const { colors, textStyles, spacing, radius } = useTheme();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => email.trim() !== "" && password !== "" && !loading,
    [email, password, loading],
  );

  async function handleSignIn() {
    setErrorText(null);
    setLoading(true);
    try {
      const { error } = await authClient.signIn.email({ email, password });

      if (error) {
        const code = (error as { code?: string }).code;
        if (code === "INVALID_EMAIL_OR_PASSWORD" || code === "INVALID_CREDENTIALS") {
          setErrorText(i18n.t("auth.invalidCredentials"));
        } else {
          setErrorText(error.message ?? i18n.t("auth.unknownError"));
        }
        return;
      }

      router.dismissAll();
    } catch (err) {
      setErrorText(
        err instanceof Error ? err.message : i18n.t("auth.unexpectedError"),
      );
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = [
    textStyles.body,
    {
      backgroundColor: colors.input,
      borderWidth: 1 as const,
      borderColor: colors.border + "33",
      borderRadius: radius.md,
      padding: spacing.md,
      color: colors.foreground,
    },
  ];

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Pressable
        accessibilityLabel={i18n.t("auth.close")}
        onPress={() => router.dismissAll()}
        style={[
          styles.closeButton,
          { top: spacing.xl, left: spacing.lg, padding: spacing.xs },
        ]}
      >
        <Text style={{ color: colors.foreground, fontSize: 22 }}>×</Text>
      </Pressable>

      <View style={[styles.content, { gap: spacing.lg }]}>
        <Text
          style={[
            textStyles.screenTitle,
            {
              color: colors.foreground,
              textAlign: "center",
              marginBottom: spacing.xl,
            },
          ]}
        >
          DRAGONS
        </Text>

        <TextInput
          style={inputStyle}
          placeholder={i18n.t("auth.email")}
          placeholderTextColor={colors.mutedForeground}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
          editable={!loading}
          textContentType="emailAddress"
          autoComplete="email"
        />

        <TextInput
          style={inputStyle}
          placeholder={i18n.t("auth.password")}
          placeholderTextColor={colors.mutedForeground}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!loading}
          textContentType="password"
          autoComplete="current-password"
        />

        {errorText ? (
          <Text style={[textStyles.body, { color: colors.destructive }]}>
            {errorText}
          </Text>
        ) : null}

        <Pressable
          onPress={handleSignIn}
          disabled={!canSubmit}
          style={[
            {
              backgroundColor: colors.primary,
              borderRadius: radius.md,
              padding: spacing.md,
              alignItems: "center",
              marginTop: spacing.sm,
            },
            !canSubmit && { opacity: 0.4 },
          ]}
        >
          {loading ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={[textStyles.button, { color: colors.primaryForeground }]}>
              {i18n.t("auth.signIn")}
            </Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 24,
  },
  closeButton: {
    position: "absolute",
    zIndex: 1,
  },
});
```

Notes for the implementer:
- `authClient.signIn.email`'s error shape is `{ code?: string; message?: string }`; the specific code may be `INVALID_EMAIL_OR_PASSWORD` from `better-auth`. Check against both spellings — they've changed between versions.
- `router.dismissAll()` is intentional: it unwinds any modal stack back to the caller (profile). Do not `router.replace("/")` — that would blow away the underlying navigation.
- The close button is styled as a large `×` to avoid pulling in an icon dependency. Keep it accessible via `accessibilityLabel`.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @dragons/native typecheck`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/app/\(auth\)/sign-in.tsx
git commit -m "refactor(native): polish sign-in with inline errors and password-manager hints"
```

---

## Task 7: Extend splash gate with session resolution

**Purpose:** Avoid the 1–2 frame flicker where a referee sees the public tab bar before the Referee tab pops in.

**Files:**
- Modify: `apps/native/src/app/_layout.tsx`

- [ ] **Step 1: Rewrite the file**

Replace `apps/native/src/app/_layout.tsx` with:

```tsx
import { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { ThemeProvider, useTheme } from "@/hooks/useTheme";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useBiometricLock } from "@/hooks/useBiometricLock";
import { authClient } from "@/lib/auth-client";
import { fontAssets } from "@/theme/typography";
import { i18n } from "@/lib/i18n";
import { colors as themeColors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";

SplashScreen.preventAutoHideAsync();

void i18n;

function RootNavigator() {
  const { colors, isDark } = useTheme();
  usePushNotifications();

  const detailHeaderOptions = {
    headerShown: true,
    headerTransparent: true,
    headerTitle: "",
    headerBackTitle: "",
    headerShadowVisible: false,
    headerTintColor: colors.foreground,
    headerBackTitleStyle: { fontSize: 0 },
  } as const;

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.background },
          headerShown: false,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ title: "" }} />
        <Stack.Screen name="team/[id]" options={detailHeaderOptions} />
        <Stack.Screen name="game/[id]" options={detailHeaderOptions} />
        <Stack.Screen name="h2h/[teamApiId]" options={detailHeaderOptions} />
        <Stack.Screen name="(auth)" options={{ presentation: "modal" }} />
        <Stack.Screen
          name="profile"
          options={{
            headerShown: true,
            headerTintColor: colors.foreground,
            headerStyle: { backgroundColor: colors.background },
            headerTitle: i18n.t("profile.title"),
          }}
        />
      </Stack>
    </>
  );
}

function UnlockScreen({ onRetry }: { onRetry: () => void }) {
  const dark = themeColors.dark;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: dark.background,
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.xl,
      }}
    >
      <Text
        style={{
          color: dark.foreground,
          fontSize: 28,
          fontWeight: "700",
          letterSpacing: 2,
        }}
      >
        DRAGONS
      </Text>
      <Pressable
        onPress={onRetry}
        style={{
          backgroundColor: dark.primary,
          paddingHorizontal: spacing.xl,
          paddingVertical: spacing.md,
          borderRadius: 12,
        }}
      >
        <Text style={{ color: dark.primaryForeground, fontSize: 16, fontWeight: "600" }}>
          {i18n.t("auth.tapToUnlock")}
        </Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts(fontAssets);
  const { isLocked, authenticate } = useBiometricLock();
  const { isPending: sessionPending } = authClient.useSession();
  const [authFailed, setAuthFailed] = useState(false);

  useEffect(() => {
    if (!fontsLoaded || sessionPending) return;

    if (isLocked) {
      void authenticate().then((success) => {
        if (success) {
          void SplashScreen.hideAsync();
        } else {
          setAuthFailed(true);
          void SplashScreen.hideAsync();
        }
      });
    } else {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, sessionPending, isLocked, authenticate]);

  if (!fontsLoaded || sessionPending) {
    return null;
  }

  if (isLocked) {
    if (!authFailed) return null;
    return (
      <UnlockScreen
        onRetry={() => {
          void authenticate().then((success) => {
            if (!success) setAuthFailed(true);
          });
        }}
      />
    );
  }

  return (
    <ThemeProvider>
      <RootNavigator />
    </ThemeProvider>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @dragons/native typecheck`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/app/_layout.tsx
git commit -m "feat(native): hold splash until session resolves"
```

---

## Task 8: Conditional Referee tab trigger

**Purpose:** Mount the Referee tab only when `authClient.useSession()` returns a user with `role ∈ {referee, admin}`. Bounce users away from the referee tab if they lose access mid-session.

**Files:**
- Modify: `apps/native/src/app/(tabs)/_layout.tsx`

- [ ] **Step 1: Rewrite the file**

Replace `apps/native/src/app/(tabs)/_layout.tsx` with:

```tsx
import { useEffect } from "react";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useRouter, useSegments } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { authClient } from "@/lib/auth-client";
import { i18n } from "@/lib/i18n";

function hasRefereeAccess(role: unknown): boolean {
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
    if (!canRef && segments[segments.length - 1] === "referee") {
      router.replace("/");
    }
  }, [canRef, segments, router]);

  return (
    <NativeTabs tintColor={colors.primary}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{i18n.t("tabs.home")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "basketball", selected: "basketball.fill" }}
          md="sports_basketball"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="schedule">
        <NativeTabs.Trigger.Label>{i18n.t("tabs.schedule")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "calendar", selected: "calendar" }}
          md="event"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="standings">
        <NativeTabs.Trigger.Label>{i18n.t("tabs.standings")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "chart.bar", selected: "chart.bar.fill" }}
          md="leaderboard"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="teams">
        <NativeTabs.Trigger.Label>{i18n.t("tabs.teams")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "person.3", selected: "person.3.fill" }}
          md="groups"
        />
      </NativeTabs.Trigger>
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

Notes for the implementer:
- If `NativeTabs` crashes because `referee.tsx` isn't defined yet, complete Task 9 in the same working copy before running the app. The typecheck in Step 2 does not validate route existence.
- If at runtime you see "SF Symbol not found: whistle", swap both `whistle` entries for `"person.badge.shield.checkmark"`. The project's iOS deployment target is in `apps/native/ios/Podfile` (search for `platform :ios`). `whistle` requires iOS 17+.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @dragons/native typecheck`

Expected: no errors. A warning that `referee` route isn't known yet is possible depending on how Expo Router types the `name` prop — typically it's typed as `string`, so no error.

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/app/\(tabs\)/_layout.tsx
git commit -m "feat(native): conditionally mount Referee tab by role"
```

---

## Task 9: Referee assignments screen

**Purpose:** The actual list of games the signed-in referee is assigned to. Pulls from `/referee/games`, groups by date, reuses `MatchCardCompact`.

**Files:**
- Create: `apps/native/src/app/(tabs)/referee.tsx`

- [ ] **Step 1: Create the screen**

Create `apps/native/src/app/(tabs)/referee.tsx`:

```tsx
import { useMemo } from "react";
import {
  View,
  Text,
  SectionList,
  ActivityIndicator,
  Pressable,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import useSWR from "swr";
import type { RefereeGameListItem, MatchListItem } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { MatchCardCompact } from "@/components/MatchCardCompact";
import { refereeApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";
import { fontFamilies } from "@/theme/typography";

function formatSectionDate(dateStr: string): string {
  const locale = i18n.locale === "de" ? "de-DE" : "en-US";
  const d = new Date(dateStr + "T00:00:00");
  const weekday = d.toLocaleDateString(locale, { weekday: "long" });
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const year = d.getFullYear();
  return `${weekday}, ${day}.${month}.${year}`;
}

interface Section {
  title: string;
  formattedTitle: string;
  data: RefereeGameListItem[];
}

function groupByDate(games: RefereeGameListItem[]): Section[] {
  const grouped = new Map<string, RefereeGameListItem[]>();
  for (const game of games) {
    const key = game.kickoffDate;
    const list = grouped.get(key);
    if (list) list.push(game);
    else grouped.set(key, [game]);
  }
  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]): Section => ({
      title: date,
      formattedTitle: formatSectionDate(date),
      data: items,
    }));
}

/** Minimal adapter so we can reuse the existing MatchCardCompact component. */
function toMatchListItem(game: RefereeGameListItem): MatchListItem {
  return {
    id: game.matchId ?? game.id,
    apiMatchId: game.apiMatchId,
    matchNo: game.matchNo,
    kickoffDate: game.kickoffDate,
    kickoffTime: game.kickoffTime,
    homeTeamName: game.homeTeamName,
    guestTeamName: game.guestTeamName,
    homeScore: null,
    guestScore: null,
    leagueName: game.leagueName,
    leagueShort: game.leagueShort,
    venueName: game.venueName,
    venueCity: game.venueCity,
    homeIsOwnClub: false,
    guestIsOwnClub: false,
    isCancelled: game.isCancelled,
    isForfeited: game.isForfeited,
  } as MatchListItem;
}

export default function RefereeScreen() {
  const { colors, textStyles, spacing, radius } = useTheme();
  const router = useRouter();

  const { data, error, isLoading, mutate, isValidating } = useSWR(
    "referee:games",
    () => refereeApi.getGames({ status: "active", limit: 500 }),
  );

  const sections = useMemo(
    () => (data ? groupByDate(data.items) : []),
    [data],
  );

  if (isLoading) {
    return (
      <Screen scroll={false}>
        <SectionHeader title={i18n.t("refereeTab.title")} />
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            paddingTop: spacing.xl,
          }}
        >
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen scroll={false}>
        <SectionHeader title={i18n.t("refereeTab.title")} />
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: spacing.xl,
            gap: spacing.md,
          }}
        >
          <Text
            style={[textStyles.body, { color: colors.mutedForeground, textAlign: "center" }]}
          >
            {i18n.t("refereeTab.error")}
          </Text>
          <Pressable
            onPress={() => {
              void mutate();
            }}
            style={{
              backgroundColor: colors.primary,
              borderRadius: radius.md,
              paddingHorizontal: spacing.xl,
              paddingVertical: spacing.md,
            }}
          >
            <Text style={[textStyles.button, { color: colors.primaryForeground }]}>
              {i18n.t("refereeTab.retry")}
            </Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (sections.length === 0) {
    return (
      <Screen scroll={false}>
        <SectionHeader title={i18n.t("refereeTab.title")} />
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            paddingTop: spacing["2xl"],
          }}
        >
          <Text style={[textStyles.body, { color: colors.mutedForeground }]}>
            {i18n.t("refereeTab.empty")}
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <SectionHeader title={i18n.t("refereeTab.title")} />
      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        renderSectionHeader={({ section }) => (
          <View
            style={{
              backgroundColor: colors.background,
              paddingVertical: spacing.xs,
              paddingTop: spacing.md,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontFamily: fontFamilies.bodySemiBold,
                color: colors.mutedForeground,
              }}
            >
              {section.formattedTitle}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={{ marginBottom: spacing.sm }}>
            <MatchCardCompact
              match={toMatchListItem(item)}
              onPress={() => {
                if (item.matchId !== null) {
                  router.push(`/game/${String(item.matchId)}`);
                }
              }}
            />
          </View>
        )}
        refreshControl={
          <RefreshControl
            refreshing={isValidating && !isLoading}
            onRefresh={() => {
              void mutate();
            }}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
      />
    </Screen>
  );
}
```

Notes for the implementer:
- `RefereeGameListItem.matchId` can be `null` (the federation's referee-game row may not have been reconciled to a public `match` row yet). The tap handler guards against that; unreconciled rows are read-only.
- `toMatchListItem` is a deliberate "narrow adapter" rather than refactoring `MatchCardCompact` to accept both shapes. Revisit only if a second caller needs it.
- If `MatchCardCompact`'s `MatchListItem` shape differs from what's hard-coded above (`homeScore`, `guestScore`, ownership flags), open `apps/native/src/components/MatchCardCompact.tsx` and read its `match` prop type — fields it reads must be covered by the adapter. Do not change `MatchCardCompact` to accommodate referee data.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @dragons/native typecheck`

Expected: no errors. If `toMatchListItem` fails typecheck because `MatchListItem` expects fields not populated here, add the minimum missing fields with safe defaults (e.g. `homeScore: null`, `guestScore: null`). Do not loosen `MatchListItem`.

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/app/\(tabs\)/referee.tsx
git commit -m "feat(native): add referee assignments tab"
```

---

## Task 10: Profile staff copy + role-gated badge

**Purpose:** Anonymous state says "staff sign-in"; signed-in state hides the role badge for bare `user` role.

**Files:**
- Modify: `apps/native/src/app/profile.tsx`

- [ ] **Step 1: Edit the anonymous branch**

Replace the `if (!session)` return in `apps/native/src/app/profile.tsx` with:

```tsx
  if (!session) {
    return (
      <>
        <Stack.Screen options={{ title: i18n.t("profile.title") }} />
        <Screen scroll={false} edges={[]}>
          <View style={styles.centeredContainer}>
            <Text
              style={[
                textStyles.sectionTitle,
                { color: colors.foreground, marginBottom: spacing.sm, textAlign: "center" },
              ]}
            >
              {i18n.t("auth.staffSignInPrompt")}
            </Text>
            <Text
              style={[
                textStyles.body,
                {
                  color: colors.mutedForeground,
                  marginBottom: spacing.xl,
                  textAlign: "center",
                  paddingHorizontal: spacing.lg,
                },
              ]}
            >
              {i18n.t("auth.staffSignInHint")}
            </Text>
            <Pressable
              onPress={() => router.push("/(auth)/sign-in")}
              style={{
                backgroundColor: colors.primary,
                borderRadius: radius.md,
                paddingHorizontal: spacing.xl,
                paddingVertical: spacing.md,
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
```

- [ ] **Step 2: Gate the role badge in the signed-in branch**

Replace the `<Badge ... />` block inside the signed-in user card with:

```tsx
            {(() => {
              const role =
                "role" in session.user && typeof session.user.role === "string"
                  ? session.user.role
                  : null;
              if (role !== "referee" && role !== "admin") return null;
              return <Badge label={role} variant="secondary" />;
            })()}
```

(The surrounding `<Card>`, name, email, biometric switch, theme row, and sign-out button are unchanged.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @dragons/native typecheck`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/native/src/app/profile.tsx
git commit -m "refactor(native): staff-framed profile anon state, hide user role badge"
```

---

## Task 11: Manual QA pass

**Purpose:** Native has no automated test harness; this is the acceptance gate.

**Files:** none.

- [ ] **Step 1: Start services**

Run in separate terminals:
- `docker compose -f docker/docker-compose.dev.yml up -d`
- `pnpm --filter @dragons/api dev`
- `pnpm --filter @dragons/native start`

Open the iOS simulator (`i` in the Expo CLI) and/or Android emulator (`a`).

- [ ] **Step 2: Run the manual test plan**

Check each item against the spec's test plan in `docs/superpowers/specs/2026-04-17-native-auth-design.md#manual-test-plan`.

- [ ] Cold start as anonymous user → home tab; no Referee tab; profile shows staff CTA + hint.
- [ ] Cold start with stored referee session → Referee tab visible on first paint (no flicker).
- [ ] Sign in with valid referee credentials → modal dismisses, Referee tab appears, profile shows user card.
- [ ] Sign in with wrong password → inline error under password field, submit button re-enables; no alert popup.
- [ ] Sign in with empty fields → submit button disabled (greyed at 0.4 opacity); no alert popup.
- [ ] iOS only: password manager offers to save credentials after first successful sign-in.
- [ ] Close button (`×`) on sign-in dismisses the modal.
- [ ] Sign out from profile → Referee tab disappears; profile flips to anonymous state.
- [ ] Sign out while viewing Referee tab → routed back to Home; Referee tab gone.
- [ ] Simulate 401 on `/referee/games` (revoke session in DB: `DELETE FROM session WHERE user_id = <id>;` then refresh the tab) → local session clears; tab unmounts.
- [ ] Offline cold start with cached session → app opens; `/referee/games` shows error state with Retry.
- [ ] Retry button on error state refetches and transitions to data or empty state.
- [ ] Empty state copy renders when the referee has no upcoming assignments (seed DB accordingly, or filter status to a state that yields zero).
- [ ] Biometric lock enabled + signed in → unlocks to referee view as expected.
- [ ] Biometric lock enabled + signed out → unlocks to anonymous view.
- [ ] Switch iOS system language to Deutsch (Settings → General → Language) and restart the app — all new strings render in `de` (tab label "Schiri", profile prompt, error texts).
- [ ] Verify role badge for an `admin` user shows "admin" (both referee and admin should render a badge).
- [ ] Verify role badge is NOT shown for a plain `user` role account (sign up via web first, inspect in native).

If any item fails, fix it in a dedicated follow-up commit (do not mutate the earlier task commits).

- [ ] **Step 3: Final clean checks**

Run:
- `pnpm --filter @dragons/api-client test`
- `pnpm --filter @dragons/api-client typecheck`
- `pnpm --filter @dragons/native typecheck`
- `pnpm check:ai-slop`

Expected: all pass.

- [ ] **Step 4: (Optional) Open PR**

Only if the user explicitly asks for a PR.

```bash
git push origin <branch>
gh pr create --title "Native: referee sign-in + role-gated tab" --body "Implements docs/superpowers/specs/2026-04-17-native-auth-design.md"
```

---

## Rollback plan

All changes are isolated to:
- `packages/api-client` (additive: a new option and a new endpoint module — existing consumers are unaffected)
- `apps/native` (self-contained: UI + i18n changes)

To roll back, revert the feature commits on the branch. No DB migrations, no schema changes, no backend changes.

## Out of scope (explicit non-goals)

- Sign-up in native, password reset in native, OAuth/social login.
- Any admin screen in native.
- Accept/decline on referee assignments.
- Automated tests on native (`jest-expo` is a separate follow-up).
- Deep-link wiring for referee-targeted push notifications (already handled server-side per `apps/api/src/workers/referee-reminder.worker.ts:77` but the mobile listener is future work).
- Session-expiry toast.
