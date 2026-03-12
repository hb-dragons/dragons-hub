# Unified Social Post Template Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Share the social post template components between frontend preview and backend export so they render identically, with a theme parameter for future configurability.

**Architecture:** Move the Satori template components (`PostLayout`, `WeekendPreview`, `WeekendResults`) to `packages/shared/src/social-templates/` with a new subpath export. Add a `PostTheme` type with `DEFAULT_THEME` constants. Load the same custom fonts in the web app via `@font-face`. Replace the CSS approximation in `image-preview.tsx` with the actual shared template rendered at 50% scale.

**Tech Stack:** React 19, TypeScript, Satori (server-side, unchanged), Next.js `@font-face`, Sharp (server-side, unchanged)

**Spec:** `docs/superpowers/specs/2026-03-12-unified-social-template-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/shared/src/social-templates/theme.ts` | Create | `PostTheme` interface and `DEFAULT_THEME` constants |
| `packages/shared/src/social-templates/shared.tsx` | Create (move + modify) | `PostLayout` component and `MatchRow` type, accepts optional `theme` prop |
| `packages/shared/src/social-templates/weekend-preview.tsx` | Create (move + modify) | `WeekendPreview` component, passes theme through |
| `packages/shared/src/social-templates/weekend-results.tsx` | Create (move + modify) | `WeekendResults` component, passes theme through |
| `packages/shared/src/social-templates/index.ts` | Create | Barrel export for all social template types and components |
| `packages/shared/package.json` | Modify | Add `@dragons/shared/social-templates` subpath export, add `react` peer dep |
| `packages/shared/tsconfig.json` | Modify | Include `.tsx` files, add `jsx: "react-jsx"` |
| `apps/web/public/fonts/LeagueSpartan-Regular.ttf` | Create | Font file for browser rendering |
| `apps/web/public/fonts/LeagueSpartan-Bold.ttf` | Create | Font file for browser rendering |
| `apps/web/public/fonts/LeagueSpartan-ExtraBold.ttf` | Create | Font file for browser rendering |
| `apps/web/public/fonts/greatertheory.otf` | Create | Font file for browser rendering |
| `apps/web/src/app/social-fonts.css` | Create | `@font-face` declarations for League Spartan + Greater Theory |
| `apps/web/src/app/layout.tsx` | Modify | Import `social-fonts.css` |
| `apps/web/src/components/admin/social/image-preview.tsx` | Modify | Replace CSS approximation with shared template components |
| `apps/api/src/services/social/social-image.service.ts` | Modify | Import templates from `@dragons/shared/social-templates` |
| `apps/api/src/services/social/templates/` | Delete | Old template files (moved to shared) |

---

## Chunk 1: Shared Template Package

### Task 1: Create PostTheme type and DEFAULT_THEME

**Files:**
- Create: `packages/shared/src/social-templates/theme.ts`

- [ ] **Step 1: Create the theme type and defaults**

```ts
// packages/shared/src/social-templates/theme.ts

export interface PostTheme {
  /** Background color for away match rows */
  awayBgColor: string;
  /** Left border color for away match rows */
  awayBorderColor: string;
  /** Background color for the "AUSW." legend badge */
  awayLegendBgColor: string;
  /** Main text color */
  textColor: string;
  /** Title font size in px (e.g. "SPIELTAG") */
  titleFontSize: number;
  /** Subtitle font size in px (e.g. "KALENDERWOCHE 10") */
  subtitleFontSize: number;
  /** Match team label + detail font size in px */
  matchFontSize: number;
  /** Opponent "vs …" line font size in px */
  opponentFontSize: number;
  /** Legend font size in px */
  legendFontSize: number;
  /** Footer font size in px */
  footerFontSize: number;
}

export const DEFAULT_THEME: PostTheme = {
  awayBgColor: "rgba(249, 115, 22, 0.15)",
  awayBorderColor: "rgba(249, 115, 22, 0.8)",
  awayLegendBgColor: "rgba(249, 115, 22, 0.8)",
  textColor: "white",
  titleFontSize: 80,
  subtitleFontSize: 24,
  matchFontSize: 36,
  opponentFontSize: 24,
  legendFontSize: 20,
  footerFontSize: 14,
};
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `pnpm --filter @dragons/shared typecheck`
Expected: PASS (this file is `.ts`, no JSX config needed yet)

---

### Task 2: Move and update PostLayout to shared package

**Files:**
- Create: `packages/shared/src/social-templates/shared.tsx`
- Modify: `packages/shared/tsconfig.json`
- Modify: `packages/shared/package.json`

- [ ] **Step 1: Update packages/shared tsconfig.json to support JSX**

Replace the contents of `packages/shared/tsconfig.json` with:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 2: Add react peer dependency and @types/react dev dependency in packages/shared/package.json**

Add to `packages/shared/package.json`:

```json
{
  "peerDependencies": {
    "react": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0"
  }
}
```

Then run `pnpm install` to install the new dependency.

Also add the subpath export:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./social-templates": "./src/social-templates/index.ts"
  }
}
```

- [ ] **Step 3: Create the PostLayout component with theme support**

Create `packages/shared/src/social-templates/shared.tsx` — this is the existing `PostLayout` from `apps/api/src/services/social/templates/shared.tsx` with an added optional `theme` prop:

```tsx
import type { ReactNode } from "react";
import { DEFAULT_THEME, type PostTheme } from "./theme";

export interface MatchRow {
  teamLabel: string;
  opponent: string;
  isHome: boolean;
  kickoffTime?: string;
  homeScore?: number;
  guestScore?: number;
}

interface PostLayoutProps {
  title: string;
  subtitle: string;
  matches: MatchRow[];
  footer: string;
  renderMatchDetail: (match: MatchRow) => ReactNode;
  theme?: PostTheme;
}

export function PostLayout({ title, subtitle, matches, footer, renderMatchDetail, theme: t = DEFAULT_THEME }: PostLayoutProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: 1080, height: 1080, fontFamily: "League Spartan", color: t.textColor, padding: "40px 50px" }}>
      {/* Title */}
      <div style={{ display: "flex", flexDirection: "column", marginBottom: 20 }}>
        <div style={{ fontSize: t.titleFontSize, fontWeight: 900, fontFamily: "Greater Theory", textTransform: "uppercase", letterSpacing: 2 }}>
          {title}
        </div>
        <div style={{ fontSize: t.subtitleFontSize, fontWeight: 700, opacity: 0.9 }}>{subtitle}</div>
      </div>

      {/* Match rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
        {matches.map((match, i) => (
          <div key={i} style={{
            display: "flex",
            flexDirection: "column",
            padding: "12px 16px",
            backgroundColor: match.isHome ? "transparent" : t.awayBgColor,
            borderLeft: match.isHome ? "none" : `4px solid ${t.awayBorderColor}`,
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <div style={{ fontSize: t.matchFontSize, fontWeight: 800 }}>{match.teamLabel}</div>
              {renderMatchDetail(match)}
            </div>
            <div style={{ display: "flex", fontSize: t.opponentFontSize, opacity: 0.85 }}>{`vs ${match.opponent}`}</div>
          </div>
        ))}
      </div>

      {/* Home/Away legend */}
      <div style={{ display: "flex", justifyContent: "center", gap: 24, marginBottom: 12 }}>
        <div style={{ fontSize: t.legendFontSize, fontWeight: 600, padding: "6px 20px" }}>HEIM</div>
        <div style={{ fontSize: t.legendFontSize, fontWeight: 600, padding: "6px 20px", backgroundColor: t.awayLegendBgColor }}>AUSW.</div>
      </div>

      {/* Footer */}
      <div style={{ display: "flex", fontSize: t.footerFontSize, justifyContent: "center", opacity: 0.7, textTransform: "uppercase", letterSpacing: 1 }}>
        {footer}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify no TypeScript errors**

Run: `pnpm --filter @dragons/shared typecheck`
Expected: PASS

---

### Task 3: Move WeekendPreview and WeekendResults, create barrel export

**Files:**
- Create: `packages/shared/src/social-templates/weekend-preview.tsx`
- Create: `packages/shared/src/social-templates/weekend-results.tsx`
- Create: `packages/shared/src/social-templates/index.ts`

- [ ] **Step 1: Create WeekendPreview component**

```tsx
// packages/shared/src/social-templates/weekend-preview.tsx
import { PostLayout, type MatchRow } from "./shared";
import { DEFAULT_THEME, type PostTheme } from "./theme";

interface Props { calendarWeek: number; matches: MatchRow[]; footer: string; theme?: PostTheme; }

export function WeekendPreview({ calendarWeek, matches, footer, theme }: Props) {
  const t = theme ?? DEFAULT_THEME;
  return (
    <PostLayout
      title="SPIELTAG"
      subtitle={`KALENDERWOCHE ${calendarWeek}`}
      matches={matches}
      footer={footer}
      theme={t}
      renderMatchDetail={(match) => (
        <div style={{ display: "flex", fontSize: t.matchFontSize, fontWeight: 700 }}>{`| ${match.kickoffTime}`}</div>
      )}
    />
  );
}
```

- [ ] **Step 2: Create WeekendResults component**

```tsx
// packages/shared/src/social-templates/weekend-results.tsx
import { PostLayout, type MatchRow } from "./shared";
import { DEFAULT_THEME, type PostTheme } from "./theme";

interface Props { calendarWeek: number; matches: MatchRow[]; footer: string; theme?: PostTheme; }

export function WeekendResults({ calendarWeek, matches, footer, theme }: Props) {
  const t = theme ?? DEFAULT_THEME;
  return (
    <PostLayout
      title="ERGEBNISSE"
      subtitle={`KALENDERWOCHE ${calendarWeek}`}
      matches={matches}
      footer={footer}
      theme={t}
      renderMatchDetail={(match) => (
        <div style={{ display: "flex", fontSize: t.matchFontSize, fontWeight: 700 }}>{`| ${match.homeScore}:${match.guestScore}`}</div>
      )}
    />
  );
}
```

- [ ] **Step 3: Create barrel export**

```ts
// packages/shared/src/social-templates/index.ts
export { PostLayout } from "./shared";
export type { MatchRow } from "./shared";
export { WeekendPreview } from "./weekend-preview";
export { WeekendResults } from "./weekend-results";
export { DEFAULT_THEME } from "./theme";
export type { PostTheme } from "./theme";
```

- [ ] **Step 4: Verify no TypeScript errors**

Run: `pnpm --filter @dragons/shared typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/social-templates/ packages/shared/package.json packages/shared/tsconfig.json
git commit -m "feat(shared): add social post template components with theme support"
```

---

## Chunk 2: Update API to Use Shared Templates

### Task 4: Update API imports and delete old template files

**Files:**
- Modify: `apps/api/src/services/social/social-image.service.ts`
- Modify: `apps/api/src/services/social/social-image.service.test.ts` (if imports change)
- Delete: `apps/api/src/services/social/templates/shared.tsx`
- Delete: `apps/api/src/services/social/templates/weekend-preview.tsx`
- Delete: `apps/api/src/services/social/templates/weekend-results.tsx`

- [ ] **Step 1: Update imports in social-image.service.ts**

Replace lines 5-7:

```ts
import { WeekendPreview } from "./templates/weekend-preview";
import { WeekendResults } from "./templates/weekend-results";
import type { MatchRow } from "./templates/shared";
```

With:

```ts
import { WeekendPreview, WeekendResults } from "@dragons/shared/social-templates";
import type { MatchRow } from "@dragons/shared/social-templates";
```

- [ ] **Step 2: Delete old template files**

```bash
rm apps/api/src/services/social/templates/shared.tsx
rm apps/api/src/services/social/templates/weekend-preview.tsx
rm apps/api/src/services/social/templates/weekend-results.tsx
rmdir apps/api/src/services/social/templates/
```

- [ ] **Step 3: Run existing tests to verify nothing broke**

Run: `pnpm --filter @dragons/api test`
Expected: All tests pass (the mock structure hasn't changed, only the import paths)

- [ ] **Step 4: Verify typecheck**

Run: `pnpm --filter @dragons/api typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/social/social-image.service.ts
git rm apps/api/src/services/social/templates/shared.tsx apps/api/src/services/social/templates/weekend-preview.tsx apps/api/src/services/social/templates/weekend-results.tsx
git commit -m "refactor(api): import social templates from @dragons/shared"
```

---

## Chunk 3: Font Files and Preview Update

### Task 5: Add font files to web app and declare @font-face

**Files:**
- Create: `apps/web/public/fonts/LeagueSpartan-Regular.ttf`
- Create: `apps/web/public/fonts/LeagueSpartan-Bold.ttf`
- Create: `apps/web/public/fonts/LeagueSpartan-ExtraBold.ttf`
- Create: `apps/web/public/fonts/greatertheory.otf`
- Create: `apps/web/src/app/social-fonts.css`
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Download font files from GCS to public/fonts/**

The font files are stored in the project's GCS bucket under `assets/fonts/`. Download them using `gcloud`:

```bash
mkdir -p apps/web/public/fonts

gcloud storage cp "gs://${GCS_BUCKET_NAME}/assets/fonts/LeagueSpartan-Regular.ttf" apps/web/public/fonts/
gcloud storage cp "gs://${GCS_BUCKET_NAME}/assets/fonts/LeagueSpartan-Bold.ttf" apps/web/public/fonts/
gcloud storage cp "gs://${GCS_BUCKET_NAME}/assets/fonts/LeagueSpartan-ExtraBold.ttf" apps/web/public/fonts/
gcloud storage cp "gs://${GCS_BUCKET_NAME}/assets/fonts/greatertheory.otf" apps/web/public/fonts/
```

The `GCS_BUCKET_NAME` env var is defined in `.env`. If `gcloud` is not available, use this Node.js one-liner (run from repo root, requires `GOOGLE_APPLICATION_CREDENTIALS` or default credentials):

```bash
node -e "
const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
const bucket = new Storage().bucket(process.env.GCS_BUCKET_NAME);
const fonts = ['LeagueSpartan-Regular.ttf','LeagueSpartan-Bold.ttf','LeagueSpartan-ExtraBold.ttf','greatertheory.otf'];
Promise.all(fonts.map(f => bucket.file('assets/fonts/' + f).download().then(([buf]) => fs.writeFileSync('apps/web/public/fonts/' + f, buf))))
  .then(() => console.log('Done'));
"
```

- [ ] **Step 2: Create @font-face CSS file**

Create `apps/web/src/app/social-fonts.css`:

```css
/* Social post template fonts — used by the preview component to match server-side Satori rendering */

@font-face {
  font-family: "League Spartan";
  src: url("/fonts/LeagueSpartan-Regular.ttf") format("truetype");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "League Spartan";
  src: url("/fonts/LeagueSpartan-Bold.ttf") format("truetype");
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "League Spartan";
  src: url("/fonts/LeagueSpartan-ExtraBold.ttf") format("truetype");
  font-weight: 800;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "Greater Theory";
  src: url("/fonts/greatertheory.otf") format("opentype");
  font-weight: 900;
  font-style: normal;
  font-display: swap;
}
```

- [ ] **Step 3: Import social-fonts.css in the root layout**

In `apps/web/src/app/layout.tsx`, add this import after the existing CSS imports:

```ts
import "./social-fonts.css";
```

The file should have these imports at the top:

```ts
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "@dragons/ui/globals.css";
import "@daveyplate/better-auth-ui/css";
import "./social-fonts.css";
```

- [ ] **Step 4: Verify the web app builds**

Run: `pnpm --filter @dragons/web typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/public/fonts/ apps/web/src/app/social-fonts.css apps/web/src/app/layout.tsx
git commit -m "feat(web): add League Spartan and Greater Theory fonts for social preview"
```

---

### Task 6: Update ImagePreview to use shared templates

**Files:**
- Modify: `apps/web/src/components/admin/social/image-preview.tsx`

- [ ] **Step 1: Rewrite image-preview.tsx to use shared template components**

Replace the entire content of `apps/web/src/components/admin/social/image-preview.tsx` with:

```tsx
"use client";

import { Rnd } from "react-rnd";
import { WeekendPreview, WeekendResults } from "@dragons/shared/social-templates";
import type { MatchRow } from "@dragons/shared/social-templates";
import type { WizardState } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const DISPLAY_SIZE = 540;
const SCALE_FACTOR = 2; // maps display coords to 1080-space

interface ImagePreviewProps {
  state: WizardState;
  onUpdate: (updates: Partial<WizardState>) => void;
}

/** Map frontend MatchItem to the shared MatchRow type used by templates */
function toMatchRows(state: WizardState): MatchRow[] {
  return state.matches.map((m) => ({
    teamLabel: m.teamLabel,
    opponent: m.opponent,
    isHome: m.isHome,
    kickoffTime: m.kickoffTime,
    homeScore: m.homeScore ?? undefined,
    guestScore: m.guestScore ?? undefined,
  }));
}

export function ImagePreview({ state, onUpdate }: ImagePreviewProps) {
  const photo = state.selectedPhoto;

  // Derive display-space dimensions for the player photo
  const photoDisplayWidth = photo
    ? Math.round((photo.width * state.playerPosition.scale) / SCALE_FACTOR)
    : 0;
  const photoDisplayHeight = photo
    ? Math.round((photo.height * state.playerPosition.scale) / SCALE_FACTOR)
    : 0;

  const matchRows = toMatchRows(state);
  const footer = "@dragons_hannover";

  return (
    <div
      style={{ width: DISPLAY_SIZE, height: DISPLAY_SIZE, position: "relative", overflow: "visible" }}
      className="rounded-md border border-border select-none"
    >
      {/* Layer 1: Background image */}
      {state.selectedBackgroundId !== null && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${API_BASE}/admin/social/backgrounds/${state.selectedBackgroundId}/image`}
          alt="Hintergrund"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          crossOrigin="use-credentials"
        />
      )}

      {/* Layer 2: Text overlay — same template as server-side export, scaled to fit preview */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${1 / SCALE_FACTOR})`,
          transformOrigin: "top left",
          width: 1080,
          height: 1080,
          pointerEvents: "none",
        }}
      >
        {state.postType === "preview"
          ? <WeekendPreview calendarWeek={state.calendarWeek} matches={matchRows} footer={footer} />
          : <WeekendResults calendarWeek={state.calendarWeek} matches={matchRows} footer={footer} />
        }
      </div>

      {/* Layer 3: Player photo (draggable/resizable) */}
      {state.selectedPhotoId !== null && photo !== null && (
        <Rnd
          lockAspectRatio
          position={{
            x: state.playerPosition.x / SCALE_FACTOR,
            y: state.playerPosition.y / SCALE_FACTOR,
          }}
          size={{ width: photoDisplayWidth, height: photoDisplayHeight }}
          onDragStop={(_e, d) => {
            onUpdate({
              playerPosition: {
                ...state.playerPosition,
                x: Math.round(d.x * SCALE_FACTOR),
                y: Math.round(d.y * SCALE_FACTOR),
              },
            });
          }}
          onResizeStop={(_e, _dir, ref, _delta, position) => {
            const newDisplayWidth = ref.offsetWidth;
            const newScale = (newDisplayWidth * SCALE_FACTOR) / photo.width;
            onUpdate({
              playerPosition: {
                x: Math.round(position.x * SCALE_FACTOR),
                y: Math.round(position.y * SCALE_FACTOR),
                scale: newScale,
              },
            });
          }}
          style={{ cursor: "move", zIndex: 10 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${API_BASE}/admin/social/player-photos/${state.selectedPhotoId}/image`}
            alt="Spielerfoto"
            style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }}
            crossOrigin="use-credentials"
            draggable={false}
          />
        </Rnd>
      )}
    </div>
  );
}
```

Key changes from the original:
- Uses JSX syntax (`<WeekendPreview ... />`) — the API calls these as functions (`WeekendPreview({ ... })`) because Satori requires a ReactElement, but in the browser we use standard JSX
- Imports `WeekendPreview`/`WeekendResults` from `@dragons/shared/social-templates`
- Adds `toMatchRows()` helper to map frontend `MatchItem` (with `null` scores) to template `MatchRow` (with `undefined` scores)
- Replaces the entire CSS approximation (lines 45-110) with the actual template component rendered at 50% scale via `transform: scale(0.5)` with `transformOrigin: "top left"`
- Adds `pointerEvents: "none"` to the text overlay so drag/resize events pass through to the player photo layer
- Removes the "Generiertes Bild kann leicht abweichen" disclaimer
- The `footer` value is hardcoded for now (same as the API uses) — this can be made dynamic when the theme admin UI is built

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/admin/social/image-preview.tsx
git commit -m "feat(social): use shared template in preview for consistent rendering"
```

---

### Task 7: Full verification

- [ ] **Step 1: Run full typecheck across the monorepo**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 2: Run full lint**

Run: `pnpm lint`
Expected: PASS (or only pre-existing warnings)

- [ ] **Step 3: Run existing tests**

Run: `pnpm test`
Expected: All existing tests pass

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: PASS
