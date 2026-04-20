# Web Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Logo, Wordmark, and ClubLogo from the native app into `apps/web` across auth, public, and admin surfaces; extract the club-logo URL as a shared helper.

**Architecture:** Per-app brand components (native keeps its own; web gets its own copies). One shared `clubLogoUrl` helper in `packages/shared` — the URL shape is the cross-platform contract. Web renders brand SVGs as plain `<img>` and remote club crests as plain `<img loading="lazy">`; no SVGR or `next/image` remote-pattern config added.

**Tech Stack:** TypeScript 6, Next.js 16, React 19, Tailwind, `next-intl`, Vitest 4. Native app uses Expo with `react-native-svg` + `expo-image` — only one native file is touched.

**Spec:** `docs/superpowers/specs/2026-04-20-web-branding-design.md`

---

## Task 1: `clubLogoUrl` helper in `packages/shared`

**Files:**
- Create: `packages/shared/src/brand.ts`
- Create: `packages/shared/src/brand.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1.1: Write the failing tests**

Create `packages/shared/src/brand.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { clubLogoUrl } from "./brand";

describe("clubLogoUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns dev default URL when no env or arg is set", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("EXPO_PUBLIC_API_URL", "");
    expect(clubLogoUrl(42)).toBe("http://localhost:3001/public/assets/clubs/42.webp");
  });

  it("uses explicit baseUrl argument over env", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://env.example.com");
    expect(clubLogoUrl(7, "https://arg.example.com")).toBe(
      "https://arg.example.com/public/assets/clubs/7.webp",
    );
  });

  it("uses NEXT_PUBLIC_API_URL when set", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://web.example.com");
    vi.stubEnv("EXPO_PUBLIC_API_URL", "");
    expect(clubLogoUrl(1)).toBe("https://web.example.com/public/assets/clubs/1.webp");
  });

  it("uses EXPO_PUBLIC_API_URL when NEXT_PUBLIC_API_URL is absent", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("EXPO_PUBLIC_API_URL", "https://expo.example.com");
    expect(clubLogoUrl(9)).toBe("https://expo.example.com/public/assets/clubs/9.webp");
  });

  it("prefers NEXT_PUBLIC_API_URL over EXPO_PUBLIC_API_URL when both are set", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://web.example.com");
    vi.stubEnv("EXPO_PUBLIC_API_URL", "https://expo.example.com");
    expect(clubLogoUrl(3)).toBe("https://web.example.com/public/assets/clubs/3.webp");
  });
});
```

- [ ] **Step 1.2: Run the tests and confirm they fail**

Run: `pnpm --filter @dragons/shared test brand`
Expected: FAIL — module `./brand` cannot be resolved.

- [ ] **Step 1.3: Implement the helper**

Create `packages/shared/src/brand.ts`:

```ts
export function clubLogoUrl(clubId: number, baseUrl?: string): string {
  const envBase =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_API_URL || process.env.EXPO_PUBLIC_API_URL
      : undefined;
  const base = baseUrl || envBase || "http://localhost:3001";
  return `${base}/public/assets/clubs/${clubId}.webp`;
}
```

Note: the `||` operator (not `??`) is used so that an empty string env value (the way `vi.stubEnv("X", "")` represents "unset") falls through to the next source.

- [ ] **Step 1.4: Export from the package entry**

Edit `packages/shared/src/index.ts` — add this line alongside the existing exports (alphabetical within the file; if there is no clear alphabetical order, append after the last `export * from ...` / `export { ... } from ...` line):

```ts
export { clubLogoUrl } from "./brand";
```

- [ ] **Step 1.5: Run the tests and confirm they pass**

Run: `pnpm --filter @dragons/shared test brand`
Expected: 5 passing tests.

- [ ] **Step 1.6: Run typecheck on shared**

Run: `pnpm --filter @dragons/shared typecheck`
Expected: no output, exit code 0.

- [ ] **Step 1.7: Commit**

```bash
git add packages/shared/src/brand.ts packages/shared/src/brand.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add clubLogoUrl helper"
```

---

## Task 2: Native `ClubLogo` uses the shared helper

**Files:**
- Modify: `apps/native/src/components/brand/ClubLogo.tsx`

- [ ] **Step 2.1: Replace inline URL construction with the helper**

Full new contents of `apps/native/src/components/brand/ClubLogo.tsx`:

```tsx
import { View } from "react-native";
import { Image } from "expo-image";
import { clubLogoUrl } from "@dragons/shared";
import { useTheme } from "../../hooks/useTheme";

type ClubLogoProps = {
  clubId?: number | null;
  size?: number;
  variant?: "plain" | "chip";
};

export function ClubLogo({ clubId, size = 24 }: ClubLogoProps) {
  const { colors } = useTheme();

  if (!clubId) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 4,
          backgroundColor: colors.muted,
        }}
      />
    );
  }

  const uri = clubLogoUrl(clubId);

  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size }}
      contentFit="contain"
      transition={120}
      cachePolicy="memory-disk"
      accessibilityIgnoresInvertColors
    />
  );
}
```

- [ ] **Step 2.2: Typecheck native**

Run: `pnpm --filter @dragons/native typecheck`
Expected: no errors.

- [ ] **Step 2.3: Commit**

```bash
git add apps/native/src/components/brand/ClubLogo.tsx
git commit -m "refactor(native): use shared clubLogoUrl helper"
```

---

## Task 3: Copy brand SVG assets to the web public folder

**Files:**
- Create: `apps/web/public/brand/logo.svg`
- Create: `apps/web/public/brand/wordmark.svg`

- [ ] **Step 3.1: Create the directory and copy assets**

Run:

```bash
mkdir -p apps/web/public/brand
cp apps/native/assets/brand/logo.svg apps/web/public/brand/logo.svg
cp apps/native/assets/brand/wordmark.svg apps/web/public/brand/wordmark.svg
```

- [ ] **Step 3.2: Verify the copies**

Run: `ls -la apps/web/public/brand/`
Expected: `logo.svg` (~53 KB) and `wordmark.svg` (~14 KB).

- [ ] **Step 3.3: Commit**

```bash
git add apps/web/public/brand/logo.svg apps/web/public/brand/wordmark.svg
git commit -m "chore(web): add brand SVG assets"
```

---

## Task 4: Web `Logo` component

**Files:**
- Create: `apps/web/src/components/brand/logo.tsx`

- [ ] **Step 4.1: Create the component**

Full contents of `apps/web/src/components/brand/logo.tsx`:

```tsx
const ASPECT = 1421.61 / 1894.29;

type LogoProps = {
  size?: number;
  width?: number;
  alt?: string;
  className?: string;
};

export function Logo({ size, width, alt = "Dragons logo", className }: LogoProps) {
  const w = width ?? (size ?? 56) * ASPECT;
  const h = width !== undefined ? width / ASPECT : (size ?? 56);
  return (
    <img
      src="/brand/logo.svg"
      width={w}
      height={h}
      alt={alt}
      className={className}
    />
  );
}
```

- [ ] **Step 4.2: Typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: no errors.

- [ ] **Step 4.3: Commit**

```bash
git add apps/web/src/components/brand/logo.tsx
git commit -m "feat(web): add Logo brand component"
```

---

## Task 5: Web `Wordmark` component

**Files:**
- Create: `apps/web/src/components/brand/wordmark.tsx`

- [ ] **Step 5.1: Create the component**

Full contents of `apps/web/src/components/brand/wordmark.tsx`:

```tsx
const ASPECT = 1432 / 384;

type WordmarkProps = {
  width?: number;
  alt?: string;
  className?: string;
};

export function Wordmark({ width = 220, alt = "Dragons", className }: WordmarkProps) {
  return (
    <img
      src="/brand/wordmark.svg"
      width={width}
      height={width / ASPECT}
      alt={alt}
      className={className}
    />
  );
}
```

- [ ] **Step 5.2: Typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: no errors.

- [ ] **Step 5.3: Commit**

```bash
git add apps/web/src/components/brand/wordmark.tsx
git commit -m "feat(web): add Wordmark brand component"
```

---

## Task 6: Web `ClubLogo` component

**Files:**
- Create: `apps/web/src/components/brand/club-logo.tsx`

- [ ] **Step 6.1: Create the component**

Full contents of `apps/web/src/components/brand/club-logo.tsx`:

```tsx
import { clubLogoUrl } from "@dragons/shared";
import { cn } from "@dragons/ui/lib/utils";

type ClubLogoProps = {
  clubId?: number | null;
  size?: number;
  alt?: string;
  className?: string;
};

export function ClubLogo({ clubId, size = 24, alt = "", className }: ClubLogoProps) {
  if (!clubId) {
    return (
      <div
        className={cn("rounded-md bg-muted", className)}
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    );
  }

  return (
    <img
      src={clubLogoUrl(clubId)}
      width={size}
      height={size}
      alt={alt}
      loading="lazy"
      className={cn("object-contain", className)}
    />
  );
}
```

- [ ] **Step 6.2: Typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: no errors.

- [ ] **Step 6.3: Commit**

```bash
git add apps/web/src/components/brand/club-logo.tsx
git commit -m "feat(web): add ClubLogo brand component"
```

---

## Task 7: Admin sidebar — replace Trophy + brand text

**Files:**
- Modify: `apps/web/src/components/admin/app-sidebar.tsx:112-127`

- [ ] **Step 7.1: Update the sidebar header**

In `apps/web/src/components/admin/app-sidebar.tsx`:

1. Do NOT touch the `Trophy` import at line 11 — it is still used at line 52 as a nav-group icon. Only the header usage at line 118 goes away.

2. Add these two imports near the other component imports:

```tsx
import { Logo } from "@/components/brand/logo";
import { Wordmark } from "@/components/brand/wordmark";
```

3. Replace the block from line 113 (`<SidebarMenuItem>`) through line 125 (`</SidebarMenuItem>`) with:

```tsx
<SidebarMenuItem>
  <SidebarMenuButton size="lg" asChild>
    <Link href="/admin" aria-label="Dragons">
      <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
        <Logo size={20} alt="" />
      </div>
      <div className="flex flex-col gap-0.5 leading-none">
        <Wordmark width={120} alt="" />
      </div>
    </Link>
  </SidebarMenuButton>
</SidebarMenuItem>
```

The `aria-label="Dragons"` on the `Link` provides an accessible name for the collapsed icon-only state where only the `Logo` renders.

- [ ] **Step 7.2: Typecheck and lint**

Run: `pnpm --filter @dragons/web typecheck && pnpm --filter @dragons/web lint`
Expected: no errors.

- [ ] **Step 7.3: Commit**

```bash
git add apps/web/src/components/admin/app-sidebar.tsx
git commit -m "feat(web): brand admin sidebar header with Logo and Wordmark"
```

---

## Task 8: Public header — replace "Dragons" text with Wordmark

**Files:**
- Modify: `apps/web/src/components/public/public-header.tsx:22-24`

- [ ] **Step 8.1: Update the header link**

In `apps/web/src/components/public/public-header.tsx`:

1. Add this import alongside the other component imports near the top:

```tsx
import { Wordmark } from "@/components/brand/wordmark";
```

2. Replace the existing home link (currently):

```tsx
<Link href="/" className="text-lg font-bold tracking-tight">
  Dragons
</Link>
```

with:

```tsx
<Link href="/" className="flex items-center">
  <Wordmark width={110} alt="Dragons" />
</Link>
```

- [ ] **Step 8.2: Typecheck and lint**

Run: `pnpm --filter @dragons/web typecheck && pnpm --filter @dragons/web lint`
Expected: no errors.

- [ ] **Step 8.3: Commit**

```bash
git add apps/web/src/components/public/public-header.tsx
git commit -m "feat(web): use Wordmark in public header"
```

---

## Task 9: Auth page — stack Logo + Wordmark above AuthView

**Files:**
- Modify: `apps/web/src/app/[locale]/auth/[path]/page.tsx`

- [ ] **Step 9.1: Update the auth page layout**

Full new contents of `apps/web/src/app/[locale]/auth/[path]/page.tsx`:

```tsx
import { AuthView } from "@daveyplate/better-auth-ui";
import { authViewPaths } from "@daveyplate/better-auth-ui/server";
import { Logo } from "@/components/brand/logo";
import { Wordmark } from "@/components/brand/wordmark";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.values(authViewPaths).map((path) => ({ path }));
}

export default async function AuthPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 p-4 md:p-6">
      <div className="flex flex-col items-center gap-3">
        <Logo size={56} alt="" />
        <Wordmark width={180} alt="Dragons" />
      </div>
      <AuthView path={path} />
    </main>
  );
}
```

- [ ] **Step 9.2: Typecheck and lint**

Run: `pnpm --filter @dragons/web typecheck && pnpm --filter @dragons/web lint`
Expected: no errors.

- [ ] **Step 9.3: Commit**

```bash
git add apps/web/src/app/[locale]/auth/[path]/page.tsx
git commit -m "feat(web): add Logo and Wordmark to auth pages"
```

---

## Task 10: Wire ClubLogo into standings rows

**Files:**
- Modify: `apps/web/src/app/[locale]/(public)/standings/page.tsx`

`StandingItem` from `@dragons/shared` already exposes `clubId: number`, confirmed in `packages/shared/src/standings.ts:4`.

- [ ] **Step 10.1: Add the import**

In `apps/web/src/app/[locale]/(public)/standings/page.tsx`, add near the other imports at the top:

```tsx
import { ClubLogo } from "@/components/brand/club-logo";
```

- [ ] **Step 10.2: Render ClubLogo in the desktop row (team name cell)**

Inside the `StandingsRow` function, desktop branch, replace:

```tsx
<td className={cn("px-3 py-2.5 font-medium", isOwn && "text-mint-shade font-semibold")}>
  {row.teamName}
</td>
```

with:

```tsx
<td className={cn("px-3 py-2.5 font-medium", isOwn && "text-mint-shade font-semibold")}>
  <div className="flex items-center gap-2">
    <ClubLogo clubId={row.clubId} size={20} />
    <span>{row.teamName}</span>
  </div>
</td>
```

- [ ] **Step 10.3: Render ClubLogo in the mobile row (team name cell)**

In the same function, mobile branch, replace:

```tsx
<td className={cn("px-2 py-2.5 font-medium", isOwn && "text-mint-shade font-semibold")}>
  <span className="block truncate max-w-[160px]">{row.teamNameShort ?? row.teamName}</span>
</td>
```

with:

```tsx
<td className={cn("px-2 py-2.5 font-medium", isOwn && "text-mint-shade font-semibold")}>
  <div className="flex items-center gap-2">
    <ClubLogo clubId={row.clubId} size={18} />
    <span className="block truncate max-w-[140px]">{row.teamNameShort ?? row.teamName}</span>
  </div>
</td>
```

Width reduced from `160px` to `140px` on mobile to make room for the 18px logo + gap inside the narrow cell.

- [ ] **Step 10.4: Typecheck and lint**

Run: `pnpm --filter @dragons/web typecheck && pnpm --filter @dragons/web lint`
Expected: no errors.

- [ ] **Step 10.5: Commit**

```bash
git add apps/web/src/app/[locale]/(public)/standings/page.tsx
git commit -m "feat(web): show club logo in standings rows"
```

---

## Task 11: Wire ClubLogo into schedule match card

**Files:**
- Modify: `apps/web/src/components/public/schedule/match-card.tsx`

`MatchListItem` exposes `homeClubId: number` and `guestClubId: number`, confirmed in `packages/shared/src/matches.ts:50,55`.

- [ ] **Step 11.1: Add the import**

In `apps/web/src/components/public/schedule/match-card.tsx`, add alongside the other imports:

```tsx
import { ClubLogo } from "@/components/brand/club-logo";
```

- [ ] **Step 11.2: Render ClubLogos in the center teams/score row**

Replace the block currently at lines 44–70 (`<div className="flex items-center gap-3">` through the closing `</div>` of the three-column layout — the home name / score / guest name row) with:

```tsx
<div className="flex items-center gap-3">
  <div className="flex flex-1 items-center justify-end gap-2">
    <p
      className={`text-sm font-semibold leading-tight ${isOwnHome ? "text-mint-shade" : ""}`}
    >
      {getTeamName(match, "home")}
    </p>
    <ClubLogo clubId={match.homeClubId} size={24} />
  </div>
  <div className="flex flex-col items-center min-w-[56px]">
    {hasScore ? (
      <span className="text-lg font-bold tabular-nums">
        {match.homeScore} : {match.guestScore}
      </span>
    ) : (
      <span className="text-sm font-medium text-muted-foreground">
        {translations.vs}
      </span>
    )}
  </div>
  <div className="flex flex-1 items-center gap-2">
    <ClubLogo clubId={match.guestClubId} size={24} />
    <p
      className={`text-sm font-semibold leading-tight ${isOwnGuest ? "text-mint-shade" : ""}`}
    >
      {getTeamName(match, "guest")}
    </p>
  </div>
</div>
```

Home logo sits on the inside edge next to the score; guest logo does the same. Home name stays right-aligned inside its flex container via `justify-end`; guest name stays left-aligned (default).

- [ ] **Step 11.3: Typecheck and lint**

Run: `pnpm --filter @dragons/web typecheck && pnpm --filter @dragons/web lint`
Expected: no errors.

- [ ] **Step 11.4: Commit**

```bash
git add apps/web/src/components/public/schedule/match-card.tsx
git commit -m "feat(web): show club logos in schedule match card"
```

---

## Task 12: Wire ClubLogo into H2H match rows

**Files:**
- Modify: `apps/web/src/app/[locale]/(public)/h2h/[teamApiId]/page.tsx`

- [ ] **Step 12.1: Add the import**

Add alongside the other imports at the top:

```tsx
import { ClubLogo } from "@/components/brand/club-logo";
```

- [ ] **Step 12.2: Render ClubLogos flanking the team names**

Inside the `matches.map(...)` render, replace the existing "Teams" block (the `<div className="min-w-0 flex-1">` containing the `<p>` with home/vs/guest spans — currently at lines 113–138) with:

```tsx
<div className="min-w-0 flex-1">
  <div className="flex items-center gap-2 truncate text-sm">
    <ClubLogo clubId={match.homeClubId} size={18} />
    <span
      className={cn(
        match.homeIsOwnClub
          ? "font-medium text-primary"
          : "text-foreground",
      )}
    >
      {homeName}
    </span>
    <span className="text-muted-foreground">{t("vs")}</span>
    <ClubLogo clubId={match.guestClubId} size={18} />
    <span
      className={cn(
        match.guestIsOwnClub
          ? "font-medium text-primary"
          : "text-foreground",
      )}
    >
      {guestName}
    </span>
  </div>
</div>
```

- [ ] **Step 12.3: Typecheck and lint**

Run: `pnpm --filter @dragons/web typecheck && pnpm --filter @dragons/web lint`
Expected: no errors.

- [ ] **Step 12.4: Commit**

```bash
git add apps/web/src/app/[locale]/(public)/h2h/[teamApiId]/page.tsx
git commit -m "feat(web): show club logos in h2h match rows"
```

---

## Task 13: Wire ClubLogo into team detail header

**Files:**
- Modify: `apps/web/src/app/[locale]/(public)/team/[id]/page.tsx`

The `team` object in this page comes from `getPublicApi().getTeams()` which returns the `teams` table rows; the schema at `packages/db/src/schema/teams.ts:21` defines `clubId: integer("club_id").notNull()`, so `team.clubId` is available.

- [ ] **Step 13.1: Add the import**

Add alongside the other imports at the top of the file:

```tsx
import { ClubLogo } from "@/components/brand/club-logo";
```

- [ ] **Step 13.2: Render ClubLogo above the team name**

Replace the team-header `<section>` (currently the block with `text-center` that wraps the `<h1>` and `<p>` elements):

```tsx
<section className="text-center">
  <h1 className="font-display text-2xl font-bold uppercase">
    {teamDisplayName}
  </h1>
  {stats?.leagueName && (
    <p className="text-sm text-muted-foreground">{stats.leagueName}</p>
  )}
  {!stats?.leagueName && leagueStandings && (
    <p className="text-sm text-muted-foreground">
      {leagueStandings.leagueName}
    </p>
  )}
</section>
```

with:

```tsx
<section className="flex flex-col items-center gap-2 text-center">
  <ClubLogo clubId={team.clubId} size={64} alt={teamDisplayName} />
  <h1 className="font-display text-2xl font-bold uppercase">
    {teamDisplayName}
  </h1>
  {stats?.leagueName && (
    <p className="text-sm text-muted-foreground">{stats.leagueName}</p>
  )}
  {!stats?.leagueName && leagueStandings && (
    <p className="text-sm text-muted-foreground">
      {leagueStandings.leagueName}
    </p>
  )}
</section>
```

The `alt={teamDisplayName}` override is appropriate here because the logo sits above the team name without an adjacent label inside the same block.

- [ ] **Step 13.3: Typecheck and lint**

Run: `pnpm --filter @dragons/web typecheck && pnpm --filter @dragons/web lint`
Expected: no errors.

- [ ] **Step 13.4: Commit**

```bash
git add apps/web/src/app/[locale]/(public)/team/[id]/page.tsx
git commit -m "feat(web): show club logo in team detail header"
```

---

## Task 14: Wire ClubLogo into game detail page

**Files:**
- Modify: `apps/web/src/app/[locale]/(public)/game/[id]/page.tsx`

`PublicMatchDetail` extends `MatchListItem`, which exposes `homeClubId` and `guestClubId` (confirmed in `packages/shared/src/match-context.ts:60` and `packages/shared/src/matches.ts:50,55`).

- [ ] **Step 14.1: Add the import**

Add alongside the other imports at the top:

```tsx
import { ClubLogo } from "@/components/brand/club-logo";
```

- [ ] **Step 14.2: Stack a ClubLogo above each team name in the score card**

The teams/score row lives inside the "Score Card" section at lines 195–250 of the file. Its current shape is three siblings inside `<div className="flex items-center justify-between gap-4">`:

1. `<div className="flex-1 text-center">` containing the home name `<p>`
2. `<div className="text-center">` containing the score or `vs` separator
3. `<div className="flex-1 text-center">` containing the guest name `<p>`

Replace sibling 1 (the home side) currently:

```tsx
<div className="flex-1 text-center">
  <p
    className={cn(
      "font-semibold",
      match.homeIsOwnClub ? "text-primary" : "text-foreground",
    )}
  >
    {homeName}
  </p>
</div>
```

with:

```tsx
<div className="flex flex-1 flex-col items-center gap-2">
  <ClubLogo clubId={match.homeClubId} size={40} />
  <p
    className={cn(
      "font-semibold",
      match.homeIsOwnClub ? "text-primary" : "text-foreground",
    )}
  >
    {homeName}
  </p>
</div>
```

Replace sibling 3 (the guest side) currently:

```tsx
<div className="flex-1 text-center">
  <p
    className={cn(
      "font-semibold",
      match.guestIsOwnClub ? "text-primary" : "text-foreground",
    )}
  >
    {guestName}
  </p>
</div>
```

with:

```tsx
<div className="flex flex-1 flex-col items-center gap-2">
  <ClubLogo clubId={match.guestClubId} size={40} />
  <p
    className={cn(
      "font-semibold",
      match.guestIsOwnClub ? "text-primary" : "text-foreground",
    )}
  >
    {guestName}
  </p>
</div>
```

Do not touch the middle score sibling, the quarter table rows (which also render `homeName` / `guestName` as first-column labels — no logo there), or any other section.

- [ ] **Step 14.3: Typecheck and lint**

Run: `pnpm --filter @dragons/web typecheck && pnpm --filter @dragons/web lint`
Expected: no errors.

- [ ] **Step 14.4: Commit**

```bash
git add apps/web/src/app/[locale]/(public)/game/[id]/page.tsx
git commit -m "feat(web): show club logos in game detail header"
```

---

## Task 15: Admin teams table — skip (documented)

`OwnClubTeam`, as rendered by `apps/web/src/app/[locale]/admin/teams/teams-table.tsx`, does not expose `clubId` today (see the local interface at lines 22–29 of that file). The spec explicitly scopes admin-side ClubLogo rendering to rows where `clubId` is already in scope; extending the admin API is out of scope for this plan.

- [ ] **Step 15.1: Confirm the gap, take no action**

Read `apps/web/src/app/[locale]/admin/teams/teams-table.tsx:22-29` and confirm the `OwnClubTeam` interface has no `clubId` field. No code change. Nothing to commit.

This task exists to document spec coverage: the admin teams table remains unchanged until the admin teams endpoint exposes `clubId` in a separate change.

---

## Task 16: Full verification pass

**Files:** none modified

- [ ] **Step 16.1: Workspace typecheck**

Run: `pnpm typecheck`
Expected: no errors in any package.

- [ ] **Step 16.2: Workspace lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 16.3: Shared package tests**

Run: `pnpm --filter @dragons/shared test`
Expected: all suites pass, including the new `brand` suite (5 tests).

- [ ] **Step 16.4: AI-slop scan**

Run: `pnpm check:ai-slop`
Expected: no banned phrases. (The spec at `docs/superpowers/specs/2026-04-20-web-branding-design.md` and this plan are both in scope for the scan.)

- [ ] **Step 16.5: Manual smoke check**

Start the web dev server in a separate terminal: `pnpm --filter @dragons/web dev`

Visit each URL in a browser and confirm:

| URL | Expected |
|---|---|
| `/` | Public header shows the Wordmark instead of the plain text "Dragons" |
| `/admin` (signed in as admin) — sidebar expanded | Logo inside the green square + Wordmark to its right |
| `/admin` — sidebar collapsed (click the rail toggle) | Logo only, no wordmark |
| `/auth/sign-in` | Logo over Wordmark, both centered above the sign-in form |
| `/standings` — desktop | Each team row shows a 20px club logo before the team name |
| `/standings` — mobile viewport | Each team row shows an 18px club logo before the team name, no overflow |
| `/schedule` | Match cards show home logo on the inside right and guest logo on the inside left of the center score |
| `/h2h/<someTeamApiId>` | Each match row shows both club logos inline with the team names |
| `/team/<someTeamId>` | Team detail header shows a 64px club logo above the team name |
| `/game/<someMatchId>` | Game header shows 40px club logos flanking each team name |

Also toggle the theme (light / dark) on `/` and `/admin` — the Wordmark renders legibly in both modes.

- [ ] **Step 16.6: Confirm no unintended changes**

Run: `git status` (expect clean) and `git log --oneline $(git merge-base HEAD main)..HEAD` (expect the 13 branding commits from Tasks 1–14, minus Task 15 which is a no-op).

---

## Rollback notes

Each task is an independent commit. Reverting any task is a single `git revert <sha>` away. The native refactor in Task 2 is the only change that crosses app boundaries; it depends on Task 1, so revert Task 1 last if backing out the whole series.

The helper in Task 1 and the native refactor in Task 2 are independently shippable — stopping there still leaves useful work merged (one shared helper, one native callsite using it).
