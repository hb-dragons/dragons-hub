# Web Branding Design

Date: 2026-04-20
Status: Approved (pending implementation plan)

## Goal

Bring the three branding elements used by the native app into `apps/web`:

1. **Logo** — the Dragon glyph SVG
2. **Wordmark** — the "DRAGONS" text mark SVG
3. **ClubLogo** — the remote per-club crest fetched by `clubId`

These exist today at `apps/native/src/components/brand/{Logo,Wordmark,ClubLogo}.tsx`. The web app has no brand components and pages render bare team names.

## Scope

Surfaces that get branding:

- **Auth pages** (`apps/web/src/app/[locale]/auth/[path]/page.tsx`) — Logo + Wordmark stacked above the `AuthView` form
- **Public header** (`apps/web/src/components/public/public-header.tsx`) — Wordmark replaces the plain "Dragons" text link
- **Admin sidebar header** (`apps/web/src/components/admin/app-sidebar.tsx`) — Logo replaces the Trophy icon, Wordmark replaces the "Dragons Admin" text. Collapsed icon mode keeps the Logo alone.
- **Public data views** — ClubLogo rendered inside rows on standings, schedule, team detail, h2h, and game detail
- **Admin data views** — ClubLogo rendered inside admin teams table and any admin row that already exposes a `clubId`

Out of scope:

- API changes to add `clubId` where it is not yet exposed. If a row lacks it, the implementation plan will flag the gap rather than reshape the API.
- SVG-to-JSX tooling (SVGR) or `next/image` remote-pattern configuration.
- Dark-mode color theming of the Logo SVG.
- Broader native changes beyond one URL-helper refactor.

## Architecture

### File layout

```
apps/web/public/brand/
  logo.svg                  copy of apps/native/assets/brand/logo.svg
  wordmark.svg              copy of apps/native/assets/brand/wordmark.svg

apps/web/src/components/brand/
  logo.tsx
  wordmark.tsx
  club-logo.tsx

packages/shared/src/
  brand.ts                  clubLogoUrl(clubId, baseUrl?)
  brand.test.ts             unit tests
  index.ts                  re-exports clubLogoUrl
```

File names on web follow the project's kebab-case convention. Native files keep their current PascalCase.

### Sharing strategy

Only the `clubLogoUrl` helper lives in `packages/shared`. The three components are thin wrappers (fewer than 20 lines each on web) and the native versions use `react-native-svg` / `expo-image` primitives that do not translate cleanly. Duplicating the components is cheaper than introducing platform-specific entry points.

### SVG rendering on web

Brand SVGs render as plain `<img src="/brand/...svg">`. This avoids adding SVGR build configuration and keeps the Logo/Wordmark color fixed. If future work needs to theme the glyph, promote to inline SVG at that point.

### ClubLogo on web

ClubLogo renders `<img src={clubLogoUrl(clubId)} loading="lazy">` with explicit `width`/`height`. No `next/image` optimizer — the asset is already webp, already the right size, and served from our own origin.

## Component APIs

### Logo

```ts
type LogoProps = {
  size?: number;     // height in px; width derived from aspect 1421.61 / 1894.29
  width?: number;    // overrides size when present
  alt?: string;      // defaults to "Dragons logo"; pass "" when decorative
  className?: string;
};
```

Aspect ratio matches the existing native component.

### Wordmark

```ts
type WordmarkProps = {
  width?: number;    // default 220; aspect 1432 / 384
  alt?: string;      // defaults to "Dragons"
  className?: string;
};
```

### ClubLogo

```ts
type ClubLogoProps = {
  clubId?: number | null;
  size?: number;     // default 24
  alt?: string;      // defaults to ""
  className?: string;
};
```

Falsy `clubId` renders a muted rounded square placeholder:

```tsx
<div
  className={cn("rounded-md bg-muted", className)}
  style={{ width: size, height: size }}
/>
```

Native's unused `variant?: "plain" | "chip"` prop is dropped on web.

### clubLogoUrl

```ts
// packages/shared/src/brand.ts
export function clubLogoUrl(clubId: number, baseUrl?: string): string {
  const base =
    baseUrl ??
    (typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_API_URL ?? process.env.EXPO_PUBLIC_API_URL
      : undefined) ??
    "http://localhost:3001";
  return `${base}/public/assets/clubs/${clubId}.webp`;
}
```

Env resolution order: explicit `baseUrl` arg, then `NEXT_PUBLIC_API_URL`, then `EXPO_PUBLIC_API_URL`, then the dev default.

## Integration points

### Admin sidebar — `apps/web/src/components/admin/app-sidebar.tsx`

Lines 112–127. The sidebar is `collapsible="icon"`, so the collapsed rail drops to a 32px icon.

- Replace the `<Trophy className="size-4" />` inside the `size-8` square with `<Logo size={20} alt="" />`
- Replace `<span>{t("nav.brand")}</span>` with `<Wordmark width={120} alt="" />`
- Add `aria-label="Dragons"` to the wrapping `<Link href="/admin">` so collapsed state still has an accessible name
- Remove the `Trophy` import

### Admin breadcrumb — `apps/web/src/components/admin/admin-breadcrumb.tsx:43`

Leave the text `{t("nav.brand")}` in place. A wordmark inside a breadcrumb is visually heavy and the word "Dragons" reads fine as a link. The `nav.brand` translation key stays live for this caller.

### Public header — `apps/web/src/components/public/public-header.tsx:22-24`

Replace the plain `"Dragons"` text inside `<Link href="/">` with `<Wordmark width={110} alt="Dragons" />`. Link wrapper and surrounding layout unchanged.

### Auth page — `apps/web/src/app/[locale]/auth/[path]/page.tsx`

Wrap `<AuthView>` in a stacked layout that matches the native sign-in:

```tsx
<main className="flex min-h-svh flex-col items-center justify-center gap-8 p-4 md:p-6">
  <div className="flex flex-col items-center gap-3">
    <Logo size={56} alt="" />
    <Wordmark width={180} alt="Dragons" />
  </div>
  <AuthView path={path} />
</main>
```

### Public data views — ClubLogo wiring

Each row-level addition inserts a ClubLogo into the team-name cell. Pass `clubId` from the row data; pass the team name as `alt` only when no adjacent text describes the club.

Targets:

- `apps/web/src/app/[locale]/(public)/standings/page.tsx` — `StandingsRow` (both desktop and mobile variants). Requires `clubId` on `StandingItem`; if absent, flagged in the plan.
- Schedule page — match rows get home + guest `ClubLogo`.
- Team detail page — header logo.
- H2H page — both club logos.
- Game detail page — both club logos.

### Admin data views

- `apps/web/src/app/[locale]/admin/teams/teams-table.tsx` — row logo.
- Any admin list where `clubId` is already in scope. Rows without `clubId` stay as-is until the API exposes it.

## Native refactor

`apps/native/src/components/brand/ClubLogo.tsx:29` currently builds the URL inline:

```ts
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3001";
const uri = `${BASE_URL}/public/assets/clubs/${clubId}.webp`;
```

Replace with:

```ts
import { clubLogoUrl } from "@dragons/shared";
// ...
const uri = clubLogoUrl(clubId);
```

Behavior is identical. This is the one change that proves the shared contract before web starts calling it.

## Accessibility

| Component | Context | alt |
|---|---|---|
| `Logo` | standalone | `"Dragons logo"` (default) |
| `Logo` | next to Wordmark | `""` — decorative, avoid double-announce |
| `Wordmark` | any | `"Dragons"` (default) |
| `ClubLogo` | next to a team name | `""` — name reads itself |
| `ClubLogo` | no adjacent name | `"{teamName} logo"` via prop |

Link accessible names:

- Admin sidebar `<Link href="/admin">` carries `aria-label="Dragons"` to cover the collapsed state where only the Logo renders.
- Public header `<Link href="/">` inherits its name from the Wordmark's `alt`.
- Auth-page wrapper is a `<div>`, not a link; no extra label needed.

No locale-specific branding behavior. The SVG assets render identically for `en` and `de`.

## i18n

- `nav.brand` — still used by `admin-breadcrumb.tsx`. Keep.
- `metadata.title` — unchanged. Brand images do not replace page titles.
- No new translation keys.

## Testing

### Unit tests — `packages/shared/src/brand.test.ts`

- `clubLogoUrl(1)` returns the dev default URL when no env or arg is set
- Explicit `baseUrl` argument takes precedence
- `NEXT_PUBLIC_API_URL` is used when set
- `EXPO_PUBLIC_API_URL` is used as a fallback when `NEXT_PUBLIC_API_URL` is absent
- `NEXT_PUBLIC_API_URL` wins over `EXPO_PUBLIC_API_URL` when both are set

If `packages/shared` has no vitest config today, the implementation adds a minimal one.

### Web component tests

Skipped. `apps/web` has no component-testing harness and coverage thresholds target `apps/api`. The three brand components are thin `<img>` wrappers. Revisit when the web harness exists.

### Manual smoke check before commit

1. `pnpm --filter @dragons/web dev`
2. `/admin` expanded — Logo + Wordmark visible in sidebar header
3. `/admin` collapsed — Logo alone in the icon rail
4. `/` — public header shows Wordmark, light and dark theme
5. `/auth/sign-in` — Logo + Wordmark stacked above the form
6. `/standings` — rows show ClubLogos; rows without `clubId` show the muted placeholder
7. `/schedule`, `/team/[id]`, `/h2h`, `/game/[id]` — crests render consistently
8. Admin teams table — ClubLogo present when `clubId` is in scope

## CI impact

- `pnpm lint` — no new rules required; naming conventions already match
- `pnpm typecheck` — all components and helpers fully typed
- `pnpm check:ai-slop` — prose files only; brand code is exempt
- `pnpm coverage` — `apps/api` thresholds are unaffected; the new `brand.ts` ships its own tests

## Rollout order

1. `clubLogoUrl` helper + tests in `packages/shared`
2. Native refactor — `ClubLogo.tsx` imports the helper
3. Web brand components + assets under `apps/web/public/brand/` and `apps/web/src/components/brand/`
4. Admin sidebar, public header, and auth-page integrations
5. ClubLogo wiring across public and admin data views, gated on `clubId` availability

Each step is independently shippable. Stopping after step 3 still leaves the web brand components in place and the native URL-helper refactor merged.
