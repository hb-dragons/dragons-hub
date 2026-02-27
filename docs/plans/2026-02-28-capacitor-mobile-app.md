# Capacitor Mobile App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deploy the Dragons web app to iOS App Store and Google Play Store using Capacitor as a native shell, with push notifications, biometric lock, public-facing pages, and mobile-responsive navigation.

**Architecture:** URL-based Capacitor shell loads the deployed Next.js app via URL (not static export). The existing SSR, server components, and cookie auth remain unchanged. Native plugins provide push notifications and biometric lock for Apple Guideline 4.2 compliance. New public API endpoints and pages serve the member/parent audience without authentication.

**Tech Stack:** Capacitor 8, @capacitor/push-notifications, @capacitor-community/biometric-auth, firebase-admin (FCM), apns2 (APNs), Hono (public routes), Next.js (public pages), Drizzle (push_devices schema)

---

## Task 1: Safe Area CSS Variables

**Files:**
- Modify: `packages/ui/src/styles/globals.css:9-61` (add safe area vars to `:root`)

**Step 1: Add safe area CSS variables to `:root` block**

In `packages/ui/src/styles/globals.css`, add these lines inside the existing `:root` block, after line 60 (`--sidebar-ring`):

```css
  /* Safe area insets for mobile (Capacitor / PWA) */
  --safe-area-top: env(safe-area-inset-top, 0px);
  --safe-area-bottom: env(safe-area-inset-bottom, 0px);
  --safe-area-left: env(safe-area-inset-left, 0px);
  --safe-area-right: env(safe-area-inset-right, 0px);
```

**Step 2: Verify the CSS parses correctly**

Run: `pnpm --filter @dragons/web build`
Expected: Build succeeds without CSS errors.

**Step 3: Commit**

```bash
git add packages/ui/src/styles/globals.css
git commit -m "feat: add safe area CSS variables for mobile support"
```

---

## Task 2: Viewport Meta Tag

**Files:**
- Modify: `apps/web/src/app/layout.tsx:22` (add `viewport-fit=cover` to `<html>`)

**Step 1: Add viewport meta tag with `viewport-fit=cover`**

In `apps/web/src/app/layout.tsx`, add a `<head>` block inside the `<html>` tag with the viewport meta:

```tsx
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
```

**Step 2: Verify the build**

Run: `pnpm --filter @dragons/web build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add apps/web/src/app/layout.tsx
git commit -m "feat: add viewport-fit=cover for safe area support"
```

---

## Task 3: Mobile-Responsive Admin Header

**Files:**
- Modify: `apps/web/src/components/admin/header.tsx` (add Sheet-based mobile nav)
- Modify: `apps/web/src/messages/en.json` (add `nav.menu` key)
- Modify: `apps/web/src/messages/de.json` (add `nav.menu` key)

**Step 1: Add `nav.menu` translation key**

In `apps/web/src/messages/en.json`, add to the `nav` section:
```json
"menu": "Menu"
```

In `apps/web/src/messages/de.json`, add to the `nav` section:
```json
"menu": "Menü"
```

**Step 2: Rewrite header with mobile Sheet navigation**

Replace `apps/web/src/components/admin/header.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/navigation";
import { cn } from "@dragons/ui/lib/utils";
import { UserButton } from "@daveyplate/better-auth-ui";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@dragons/ui/components/sheet";
import { Button } from "@dragons/ui/components/button";
import { MenuIcon } from "lucide-react";

const navLinks = [
  { href: "/admin/matches" as const, labelKey: "nav.matches" as const },
  { href: "/admin/referees" as const, labelKey: "nav.referees" as const },
  { href: "/admin/standings" as const, labelKey: "nav.standings" as const },
  { href: "/admin/venues" as const, labelKey: "nav.venues" as const },
  { href: "/admin/teams" as const, labelKey: "nav.teams" as const },
  { href: "/admin/users" as const, labelKey: "nav.users" as const },
  { href: "/admin/board" as const, labelKey: "nav.board" as const },
  { href: "/admin/bookings" as const, labelKey: "nav.bookings" as const },
  { href: "/admin/sync" as const, labelKey: "nav.sync" as const },
  { href: "/admin/settings" as const, labelKey: "nav.settings" as const },
];

export function Header() {
  const pathname = usePathname();
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pt-[var(--safe-area-top)]">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6">
        <Link href="/admin" className="text-lg font-semibold tracking-tight">
          {t("nav.brand")}
        </Link>

        {/* Desktop navigation */}
        <nav className="hidden md:flex flex-1 items-center gap-1">
          {navLinks.map((link) => {
            const isActive = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(link.labelKey)}
              </Link>
            );
          })}
        </nav>

        {/* Spacer for mobile */}
        <div className="flex-1 md:hidden" />

        <ThemeToggle />
        <LocaleSwitcher />
        <UserButton size="icon" align="center" />

        {/* Mobile menu */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <MenuIcon className="h-5 w-5" />
              <span className="sr-only">{t("nav.menu")}</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left">
            <SheetHeader>
              <SheetTitle>{t("nav.brand")}</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-4">
              {navLinks.map((link) => {
                const isActive = pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t(link.labelKey)}
                  </Link>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
```

Key changes:
- Desktop nav: wrapped in `hidden md:flex`
- Mobile: hamburger button (visible `md:hidden`) opens a Sheet from the left
- Sheet links close the sheet on click via `setOpen(false)`
- Header gets `pt-[var(--safe-area-top)]` to respect the notch/Dynamic Island

**Step 3: Verify the build and visual check**

Run: `pnpm --filter @dragons/web build`
Expected: Build succeeds.

Run: `pnpm --filter @dragons/web dev` and check at http://localhost:3000
Expected: Desktop shows horizontal nav as before. Resizing to mobile width shows hamburger menu.

**Step 4: Commit**

```bash
git add apps/web/src/components/admin/header.tsx apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "feat: add mobile-responsive admin navigation with sheet drawer"
```

---

## Task 4: Admin Layout Safe Area Bottom Padding

**Files:**
- Modify: `apps/web/src/app/[locale]/admin/layout.tsx`

**Step 1: Add bottom safe area padding to admin layout**

```tsx
import { Header } from "@/components/admin/header";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 pb-[calc(1.5rem+var(--safe-area-bottom))]">
        {children}
      </main>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/app/[locale]/admin/layout.tsx
git commit -m "feat: add safe area bottom padding to admin layout"
```

---

## Task 5: Capacitor Context Detection Utility

**Files:**
- Create: `apps/web/src/lib/capacitor.ts`

**Step 1: Create the utility**

```typescript
/**
 * Detect whether the app is running inside a Capacitor native shell.
 * Only available on the client — always returns false during SSR.
 */
export function isCapacitor(): boolean {
  return (
    typeof window !== "undefined" &&
    (window as Record<string, unknown>).Capacitor !== undefined
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/capacitor.ts
git commit -m "feat: add Capacitor context detection utility"
```

---

## Task 6: Push Devices Database Schema

**Files:**
- Create: `packages/db/src/schema/push-devices.ts`
- Modify: `packages/db/src/schema/index.ts` (add export)

**Step 1: Create the push devices schema**

```typescript
import {
  pgTable,
  serial,
  text,
  varchar,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";

export const pushDevices = pgTable(
  "push_devices",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    token: text("token").notNull(),
    platform: varchar("platform", { length: 10 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIdx: index("push_devices_user_idx").on(table.userId),
    tokenUnique: unique("push_devices_token_unique").on(table.token),
  }),
);

export type PushDevice = typeof pushDevices.$inferSelect;
export type NewPushDevice = typeof pushDevices.$inferInsert;
```

**Step 2: Export from schema index**

Add to `packages/db/src/schema/index.ts`:

```typescript
export * from "./push-devices";
```

**Step 3: Generate the migration**

Run: `pnpm --filter @dragons/db db:generate`
Expected: A new migration file is generated in `packages/db/drizzle/`.

**Step 4: Run the migration**

Run: `pnpm --filter @dragons/db db:migrate`
Expected: Migration applies successfully, `push_devices` table created.

**Step 5: Commit**

```bash
git add packages/db/src/schema/push-devices.ts packages/db/src/schema/index.ts packages/db/drizzle/
git commit -m "feat: add push_devices database schema"
```

---

## Task 7: Push Device Registration API Endpoints

**Files:**
- Create: `apps/api/src/routes/device.routes.ts`
- Create: `apps/api/src/routes/device.routes.test.ts`
- Modify: `apps/api/src/routes/index.ts` (add route)
- Modify: `apps/api/src/app.ts` (mount at non-admin path)

**Step 1: Write the failing test**

Create `apps/api/src/routes/device.routes.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { app } from "../app";

// Mock auth middleware to inject a user
vi.mock("../config/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue({
        user: { id: "user-1", role: "user", email: "test@test.com", name: "Test" },
        session: { id: "session-1" },
      }),
    },
    handler: vi.fn(),
  },
}));

// Mock database operations
vi.mock("../config/database", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          set: vi.fn().mockResolvedValue([{ id: 1 }]),
          returning: vi.fn().mockResolvedValue([{ id: 1 }]),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({ rowCount: 1 }),
    }),
  },
}));

describe("Device Routes", () => {
  describe("POST /api/devices/register", () => {
    it("registers a device token", async () => {
      const res = await app.request("/api/devices/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "fcm-token-123", platform: "android" }),
      });
      expect(res.status).toBe(200);
    });

    it("rejects invalid platform", async () => {
      const res = await app.request("/api/devices/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "token-123", platform: "windows" }),
      });
      expect(res.status).toBe(400);
    });

    it("rejects missing token", async () => {
      const res = await app.request("/api/devices/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "ios" }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/devices/:token", () => {
    it("unregisters a device token", async () => {
      const res = await app.request("/api/devices/fcm-token-123", {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
    });
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dragons/api test -- device.routes`
Expected: FAIL — route does not exist.

**Step 3: Create the device routes**

Create `apps/api/src/routes/device.routes.ts`:

```typescript
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../config/database";
import { pushDevices } from "@dragons/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "../config/auth";

const deviceRoutes = new Hono();

const registerBodySchema = z.object({
  token: z.string().min(1),
  platform: z.enum(["ios", "android"]),
});

// POST /api/devices/register — Register push notification device token
deviceRoutes.post("/register", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  }

  const body = await c.req.json();
  const parsed = registerBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Invalid request", code: "VALIDATION_ERROR", details: parsed.error.issues },
      400,
    );
  }

  const { token, platform } = parsed.data;

  await db
    .insert(pushDevices)
    .values({ userId: session.user.id, token, platform })
    .onConflictDoUpdate({
      target: pushDevices.token,
      set: { userId: session.user.id, platform, updatedAt: new Date() },
    });

  return c.json({ success: true });
});

// DELETE /api/devices/:token — Unregister device token
deviceRoutes.delete("/:token", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  }

  const token = c.req.param("token");
  await db.delete(pushDevices).where(
    and(eq(pushDevices.token, token), eq(pushDevices.userId, session.user.id)),
  );

  return c.json({ success: true });
});

export { deviceRoutes };
```

**Step 4: Mount the routes in the app**

In `apps/api/src/routes/index.ts`, add:

```typescript
import { deviceRoutes } from "./device.routes";
```

And add the route mounting:

```typescript
routes.route("/api/devices", deviceRoutes);
```

**Step 5: Run the test to verify it passes**

Run: `pnpm --filter @dragons/api test -- device.routes`
Expected: PASS

**Step 6: Run full test suite to check for regressions**

Run: `pnpm --filter @dragons/api test`
Expected: All tests pass.

**Step 7: Commit**

```bash
git add apps/api/src/routes/device.routes.ts apps/api/src/routes/device.routes.test.ts apps/api/src/routes/index.ts
git commit -m "feat: add push device registration API endpoints"
```

---

## Task 8: Public API Endpoints

**Files:**
- Create: `apps/api/src/routes/public/match.routes.ts`
- Create: `apps/api/src/routes/public/standings.routes.ts`
- Create: `apps/api/src/routes/public/team.routes.ts`
- Create: `apps/api/src/routes/public/match.routes.test.ts`
- Create: `apps/api/src/routes/public/standings.routes.test.ts`
- Create: `apps/api/src/routes/public/team.routes.test.ts`
- Modify: `apps/api/src/routes/index.ts` (mount public routes)
- Reference: `apps/api/src/services/admin/match-admin.service.ts` (reuse `getOwnClubMatches`)
- Reference: `apps/api/src/services/admin/standings-admin.service.ts` (reuse `getStandings`)

These endpoints expose the same data as the admin endpoints but without requiring authentication. They are mounted outside the `/admin/*` path so they skip the `requireAdmin` middleware.

**Step 1: Write the failing test for public match routes**

Create `apps/api/src/routes/public/match.routes.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { app } from "../../app";

vi.mock("../../services/admin/match-admin.service", () => ({
  getOwnClubMatches: vi.fn().mockResolvedValue({
    data: [],
    total: 0,
    limit: 25,
    offset: 0,
  }),
}));

describe("Public Match Routes", () => {
  it("GET /public/matches returns matches without auth", async () => {
    const res = await app.request("/public/matches");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("data");
  });
});
```

**Step 2: Run it to verify it fails**

Run: `pnpm --filter @dragons/api test -- public/match.routes`
Expected: FAIL — route not found.

**Step 3: Create public match routes**

Create `apps/api/src/routes/public/match.routes.ts`:

```typescript
import { Hono } from "hono";
import { getOwnClubMatches } from "../../services/admin/match-admin.service";
import { matchListQuerySchema } from "../admin/match.schemas";

const publicMatchRoutes = new Hono();

// GET /public/matches — List own club matches (no auth)
publicMatchRoutes.get("/matches", async (c) => {
  const query = matchListQuerySchema.parse({
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
    leagueId: c.req.query("leagueId"),
    dateFrom: c.req.query("dateFrom"),
    dateTo: c.req.query("dateTo"),
  });
  const result = await getOwnClubMatches(query);
  return c.json(result);
});

export { publicMatchRoutes };
```

**Step 4: Create public standings routes**

Create `apps/api/src/routes/public/standings.routes.ts`:

```typescript
import { Hono } from "hono";
import { getStandings } from "../../services/admin/standings-admin.service";

const publicStandingsRoutes = new Hono();

// GET /public/standings — League standings (no auth)
publicStandingsRoutes.get("/standings", async (c) => {
  const result = await getStandings();
  return c.json(result);
});

export { publicStandingsRoutes };
```

**Step 5: Create public team routes**

Create `apps/api/src/routes/public/team.routes.ts`:

```typescript
import { Hono } from "hono";
import { db } from "../../config/database";
import { teams } from "@dragons/db/schema";

const publicTeamRoutes = new Hono();

// GET /public/teams — List own club teams (no auth)
publicTeamRoutes.get("/teams", async (c) => {
  const result = await db.select().from(teams);
  return c.json(result);
});

export { publicTeamRoutes };
```

**Step 6: Mount public routes in index.ts**

In `apps/api/src/routes/index.ts`, add:

```typescript
import { publicMatchRoutes } from "./public/match.routes";
import { publicStandingsRoutes } from "./public/standings.routes";
import { publicTeamRoutes } from "./public/team.routes";
```

And mount them:

```typescript
routes.route("/public", publicMatchRoutes);
routes.route("/public", publicStandingsRoutes);
routes.route("/public", publicTeamRoutes);
```

Note: `/public/*` is NOT matched by `app.use("/admin/*", requireAdmin)` in `apps/api/src/app.ts:33`, so these routes skip authentication.

**Step 7: Write tests for standings and team routes**

Create `apps/api/src/routes/public/standings.routes.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { app } from "../../app";

vi.mock("../../services/admin/standings-admin.service", () => ({
  getStandings: vi.fn().mockResolvedValue([]),
}));

describe("Public Standings Routes", () => {
  it("GET /public/standings returns standings without auth", async () => {
    const res = await app.request("/public/standings");
    expect(res.status).toBe(200);
  });
});
```

Create `apps/api/src/routes/public/team.routes.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { app } from "../../app";

vi.mock("../../config/database", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockResolvedValue([]),
    }),
  },
}));

describe("Public Team Routes", () => {
  it("GET /public/teams returns teams without auth", async () => {
    const res = await app.request("/public/teams");
    expect(res.status).toBe(200);
  });
});
```

**Step 8: Run all public route tests**

Run: `pnpm --filter @dragons/api test -- public/`
Expected: All tests pass.

**Step 9: Run full test suite**

Run: `pnpm --filter @dragons/api test`
Expected: All tests pass.

**Step 10: Commit**

```bash
git add apps/api/src/routes/public/ apps/api/src/routes/index.ts
git commit -m "feat: add public API endpoints for matches, standings, and teams"
```

---

## Task 9: Public Web Pages

**Files:**
- Create: `apps/web/src/app/[locale]/schedule/page.tsx`
- Create: `apps/web/src/app/[locale]/standings/page.tsx`
- Create: `apps/web/src/app/[locale]/teams/page.tsx`
- Create: `apps/web/src/app/[locale]/layout-public.tsx` (shared public layout)
- Modify: `apps/web/src/proxy.ts:24-28` (add public paths)
- Modify: `apps/web/src/messages/en.json` (add public page translations)
- Modify: `apps/web/src/messages/de.json` (add public page translations)

**Step 1: Update middleware to allow public paths**

In `apps/web/src/proxy.ts`, modify the public paths check (line 24-28) to include the new public routes:

```typescript
  // Public paths — skip auth, just handle locale
  if (
    logicalPathname === "/" ||
    logicalPathname.startsWith("/auth") ||
    logicalPathname.startsWith("/api/auth") ||
    logicalPathname.startsWith("/schedule") ||
    logicalPathname.startsWith("/standings") ||
    logicalPathname.startsWith("/teams")
  ) {
    return intlMiddleware(request);
  }
```

**Step 2: Add translations for public pages**

Add to `apps/web/src/messages/en.json` (in the root object):

```json
"public": {
  "schedule": "Schedule",
  "standings": "Standings",
  "teams": "Teams",
  "upcomingMatches": "Upcoming Matches",
  "recentResults": "Recent Results",
  "noMatches": "No matches found.",
  "noStandings": "No standings available.",
  "noTeams": "No teams found.",
  "adminLink": "Admin Dashboard"
}
```

Add equivalent German translations to `apps/web/src/messages/de.json`:

```json
"public": {
  "schedule": "Spielplan",
  "standings": "Tabellen",
  "teams": "Mannschaften",
  "upcomingMatches": "Nächste Spiele",
  "recentResults": "Letzte Ergebnisse",
  "noMatches": "Keine Spiele gefunden.",
  "noStandings": "Keine Tabellen verfügbar.",
  "noTeams": "Keine Mannschaften gefunden.",
  "adminLink": "Admin-Bereich"
}
```

**Step 3: Create the schedule page**

Create `apps/web/src/app/[locale]/schedule/page.tsx`:

```tsx
import { fetchAPI } from "@/lib/api";
import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/navigation";

export default async function SchedulePage() {
  const t = await getTranslations("public");
  const matches = await fetchAPI<{ data: Array<Record<string, unknown>> }>(
    "/public/matches?limit=50",
  ).catch(() => ({ data: [] }));

  return (
    <div className="mx-auto max-w-3xl px-6 py-6 pt-[calc(1.5rem+var(--safe-area-top))] pb-[calc(1.5rem+var(--safe-area-bottom))]">
      <h1 className="text-2xl font-bold mb-6">{t("schedule")}</h1>
      {matches.data.length === 0 ? (
        <p className="text-muted-foreground">{t("noMatches")}</p>
      ) : (
        <div className="space-y-3">
          {matches.data.map((match) => (
            <div key={String(match.id)} className="rounded-lg border p-4">
              <p className="font-medium">
                {String(match.homeTeamName ?? "")} vs {String(match.awayTeamName ?? "")}
              </p>
              <p className="text-sm text-muted-foreground">
                {match.matchDate ? new Date(String(match.matchDate)).toLocaleDateString() : ""}
              </p>
            </div>
          ))}
        </div>
      )}
      <div className="mt-8">
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          {t("adminLink")} →
        </Link>
      </div>
    </div>
  );
}
```

**Step 4: Create the standings page**

Create `apps/web/src/app/[locale]/standings/page.tsx`:

```tsx
import { fetchAPI } from "@/lib/api";
import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/navigation";

export default async function StandingsPage() {
  const t = await getTranslations("public");
  const standings = await fetchAPI<Array<Record<string, unknown>>>(
    "/public/standings",
  ).catch(() => []);

  return (
    <div className="mx-auto max-w-3xl px-6 py-6 pt-[calc(1.5rem+var(--safe-area-top))] pb-[calc(1.5rem+var(--safe-area-bottom))]">
      <h1 className="text-2xl font-bold mb-6">{t("standings")}</h1>
      {standings.length === 0 ? (
        <p className="text-muted-foreground">{t("noStandings")}</p>
      ) : (
        <pre className="text-sm">{JSON.stringify(standings, null, 2)}</pre>
      )}
      <div className="mt-8">
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          {t("adminLink")} →
        </Link>
      </div>
    </div>
  );
}
```

**Step 5: Create the teams page**

Create `apps/web/src/app/[locale]/teams/page.tsx`:

```tsx
import { fetchAPI } from "@/lib/api";
import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/navigation";

export default async function TeamsPage() {
  const t = await getTranslations("public");
  const teams = await fetchAPI<Array<Record<string, unknown>>>(
    "/public/teams",
  ).catch(() => []);

  return (
    <div className="mx-auto max-w-3xl px-6 py-6 pt-[calc(1.5rem+var(--safe-area-top))] pb-[calc(1.5rem+var(--safe-area-bottom))]">
      <h1 className="text-2xl font-bold mb-6">{t("teams")}</h1>
      {teams.length === 0 ? (
        <p className="text-muted-foreground">{t("noTeams")}</p>
      ) : (
        <div className="space-y-3">
          {teams.map((team) => (
            <div key={String(team.id)} className="rounded-lg border p-4">
              <p className="font-medium">{String(team.teamName ?? team.name ?? "")}</p>
            </div>
          ))}
        </div>
      )}
      <div className="mt-8">
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          {t("adminLink")} →
        </Link>
      </div>
    </div>
  );
}
```

**Step 6: Verify build**

Run: `pnpm --filter @dragons/web build`
Expected: Build succeeds.

**Step 7: Commit**

```bash
git add apps/web/src/app/[locale]/schedule/ apps/web/src/app/[locale]/standings/ apps/web/src/app/[locale]/teams/ apps/web/src/proxy.ts apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "feat: add public schedule, standings, and teams pages"
```

---

## Task 10: Update Root Page to Show Public Navigation

**Files:**
- Modify: `apps/web/src/app/[locale]/page.tsx`

**Step 1: Check current root page**

Read `apps/web/src/app/[locale]/page.tsx` to see what it currently does (likely redirects to `/admin`).

**Step 2: Update root page to show public navigation**

Replace with a landing page that links to public pages and admin:

```tsx
import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/navigation";

export default async function HomePage() {
  const t = await getTranslations("public");

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6">
      <h1 className="text-3xl font-bold">Dragons</h1>
      <nav className="flex flex-col gap-3 text-center">
        <Link href="/schedule" className="rounded-lg border px-6 py-3 font-medium hover:bg-muted">
          {t("schedule")}
        </Link>
        <Link href="/standings" className="rounded-lg border px-6 py-3 font-medium hover:bg-muted">
          {t("standings")}
        </Link>
        <Link href="/teams" className="rounded-lg border px-6 py-3 font-medium hover:bg-muted">
          {t("teams")}
        </Link>
        <Link href="/admin" className="mt-4 text-sm text-muted-foreground hover:text-foreground">
          {t("adminLink")} →
        </Link>
      </nav>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add apps/web/src/app/[locale]/page.tsx
git commit -m "feat: update root page with public navigation links"
```

---

## Task 11: Capacitor Project Setup

**Files:**
- Create: `apps/mobile/package.json`
- Create: `apps/mobile/capacitor.config.ts`
- Create: `apps/mobile/tsconfig.json`
- Create: `apps/mobile/src/index.ts`

**Step 1: Create `apps/mobile/package.json`**

```json
{
  "name": "@dragons/mobile",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "cap:sync": "cap sync",
    "cap:open:ios": "cap open ios",
    "cap:open:android": "cap open android",
    "cap:assets": "capacitor-assets generate"
  },
  "dependencies": {
    "@capacitor/core": "^8.0.0",
    "@capacitor/ios": "^8.0.0",
    "@capacitor/android": "^8.0.0",
    "@capacitor/splash-screen": "^8.0.0",
    "@capacitor/push-notifications": "^8.0.0",
    "@capacitor/preferences": "^8.0.0",
    "@capacitor-community/biometric-auth": "^8.0.0"
  },
  "devDependencies": {
    "@capacitor/cli": "^8.0.0",
    "@capacitor/assets": "^3.0.0",
    "typescript": "~5.9.3"
  }
}
```

**Step 2: Create `apps/mobile/capacitor.config.ts`**

```typescript
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.dragons.app",
  appName: "Dragons",
  webDir: "dist",
  server: {
    url: process.env.MOBILE_SERVER_URL || "http://localhost:3000",
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      androidSplashResourceName: "splash",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
  ios: {
    scheme: "Dragons",
  },
};

export default config;
```

**Step 3: Create `apps/mobile/tsconfig.json`**

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

**Step 4: Create `apps/mobile/src/index.ts`**

```typescript
import { SplashScreen } from "@capacitor/splash-screen";
import { PushNotifications } from "@capacitor/push-notifications";
import { Preferences } from "@capacitor/preferences";

/**
 * Initialize Capacitor plugins on app launch.
 * This file is loaded by the native app before the WebView content.
 */
async function initApp() {
  // Hide splash screen after web content loads
  await SplashScreen.hide();

  // Request push notification permission
  const permResult = await PushNotifications.requestPermissions();
  if (permResult.receive === "granted") {
    await PushNotifications.register();
  }

  // Listen for push token registration
  PushNotifications.addListener("registration", async (token) => {
    const platform = (await import("@capacitor/core")).Capacitor.getPlatform();
    // Send token to API
    await fetch(
      `${window.location.origin}/api/devices/register`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token: token.value, platform }),
      },
    ).catch(console.error);
  });

  // Handle push notification received while app is open
  PushNotifications.addListener("pushNotificationReceived", (notification) => {
    console.log("Push notification received:", notification);
  });

  // Handle push notification tap
  PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    console.log("Push notification action:", action);
    // Navigate to relevant page based on notification data
    const data = action.notification.data;
    if (data?.url) {
      window.location.href = data.url;
    }
  });

  // Check biometric lock preference
  const { value: biometricEnabled } = await Preferences.get({
    key: "biometric_lock_enabled",
  });

  if (biometricEnabled === "true") {
    try {
      const { BiometricAuth } = await import(
        "@capacitor-community/biometric-auth"
      );
      await BiometricAuth.authenticate({
        reason: "Unlock Dragons",
        allowDeviceCredential: true,
      });
    } catch {
      // Biometric auth failed or was cancelled — user stays on current screen
      console.warn("Biometric authentication failed or cancelled");
    }
  }
}

// Run on DOM ready
if (document.readyState === "complete") {
  initApp();
} else {
  document.addEventListener("DOMContentLoaded", initApp);
}
```

**Step 5: Create a minimal `apps/mobile/dist/index.html`**

This file is required by Capacitor but won't actually be served (we load via URL). Create a minimal placeholder:

```html
<!DOCTYPE html>
<html>
  <head><title>Dragons</title></head>
  <body><p>Loading...</p></body>
</html>
```

**Step 6: Install dependencies**

Run: `cd apps/mobile && pnpm install`
Expected: All Capacitor packages install.

**Step 7: Initialize native platforms**

Run from `apps/mobile`:
```bash
npx cap add ios
npx cap add android
```
Expected: `ios/` and `android/` directories created.

**Step 8: Add `apps/mobile/ios/` and `apps/mobile/android/` to `.gitignore` (optional)**

These can be generated from `cap sync`. Decide whether to track them in git. Recommendation: **track them** so that native configuration changes (Info.plist, AndroidManifest.xml) are versioned.

**Step 9: Commit**

```bash
git add apps/mobile/
git commit -m "feat: initialize Capacitor mobile project with push and biometric plugins"
```

---

## Task 12: App Icon and Splash Screen Assets

**Files:**
- Create: `apps/mobile/resources/icon.png` (1024x1024)
- Create: `apps/mobile/resources/splash.png` (2732x2732)

**Step 1: Create or place source assets**

Place a 1024x1024 PNG as `apps/mobile/resources/icon.png` (Dragons logo).
Place a 2732x2732 PNG as `apps/mobile/resources/splash.png` (Dragons splash).

If you don't have these yet, use a placeholder solid color image and replace later.

**Step 2: Generate platform assets**

Run from `apps/mobile`:
```bash
npx @capacitor/assets generate
```
Expected: iOS and Android icon and splash screen assets generated in their respective directories.

**Step 3: Sync native projects**

Run: `npx cap sync`
Expected: Native projects updated with new assets.

**Step 4: Commit**

```bash
git add apps/mobile/resources/ apps/mobile/ios/ apps/mobile/android/
git commit -m "feat: add app icon and splash screen assets"
```

---

## Task 13: iOS and Android Configuration Adjustments

**Files:**
- Modify: `apps/mobile/ios/App/App/Info.plist` (push notification entitlements)
- Modify: `apps/mobile/android/app/src/main/AndroidManifest.xml` (permissions)
- Modify: `apps/mobile/android/app/build.gradle` (Firebase config if using FCM)

**Step 1: iOS — Add push notification capability**

In Xcode (opened via `npx cap open ios`):
1. Select the App target → Signing & Capabilities
2. Click "+ Capability" → Add "Push Notifications"
3. Add "Background Modes" → check "Remote notifications"

This modifies `App.entitlements` which will be tracked in git.

**Step 2: Android — Verify push permissions**

Check `apps/mobile/android/app/src/main/AndroidManifest.xml` includes:
```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.INTERNET" />
```

Capacitor 8 typically includes these by default.

**Step 3: Android — Add `google-services.json` (if using FCM)**

Download `google-services.json` from Firebase Console and place at:
`apps/mobile/android/app/google-services.json`

Add to `.gitignore`:
```
apps/mobile/android/app/google-services.json
```

**Step 4: Commit**

```bash
git add apps/mobile/ios/ apps/mobile/android/ .gitignore
git commit -m "feat: configure iOS and Android native push notification support"
```

---

## Task 14: Typecheck and Full Build Verification

**Step 1: Run typecheck across the monorepo**

Run: `pnpm typecheck`
Expected: No type errors.

**Step 2: Run linter**

Run: `pnpm lint`
Expected: No lint errors.

**Step 3: Run all tests**

Run: `pnpm test`
Expected: All tests pass.

**Step 4: Run full build**

Run: `pnpm build`
Expected: All packages build successfully.

**Step 5: Commit any fixes if needed**

If any issues found, fix them and commit:
```bash
git commit -m "fix: resolve build issues from mobile app integration"
```

---

## Task Summary

| Task | Description | Depends On |
|------|-------------|------------|
| 1 | Safe area CSS variables | — |
| 2 | Viewport meta tag | — |
| 3 | Mobile-responsive admin header | 1 |
| 4 | Admin layout safe area padding | 1 |
| 5 | Capacitor context detection utility | — |
| 6 | Push devices database schema | — |
| 7 | Push device registration API | 6 |
| 8 | Public API endpoints | — |
| 9 | Public web pages | 8 |
| 10 | Root page public navigation | 9 |
| 11 | Capacitor project setup | 5, 7 |
| 12 | App icon and splash screen | 11 |
| 13 | iOS/Android native config | 11 |
| 14 | Full build verification | All |

Tasks 1, 2, 5, 6, 8 can run in parallel. Tasks 3-4 depend on 1. Task 7 depends on 6. Tasks 9-10 depend on 8. Tasks 11-13 depend on earlier tasks. Task 14 runs last.
