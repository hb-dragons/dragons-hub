# Instagram Post Generator — Part 3: Frontend Wizard

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin UI wizard for creating social posts: select post type and week, review matches, pick player photo and background, drag/resize the player photo position, generate and download the final PNG.

**Architecture:** A 4-step client-side wizard at `/admin/social/create`. State managed in React state (no drafts/persistence). Communicates with the API endpoints from Part 1 and 2. Uses `react-rnd` for drag & resize in the preview step.

**Tech Stack:** Next.js 16, react-rnd, date-fns, @dragons/ui components, Tailwind CSS

**Depends on:** Part 1 (asset management API) + Part 2 (generate endpoint)

---

### Task 1: Install dependencies and add types

**Files:**
- Create: `apps/web/src/components/admin/social/types.ts`
- Modify: `apps/web/src/lib/swr-keys.ts`

- [ ] **Step 1: Install react-rnd**

```bash
pnpm --filter @dragons/web add react-rnd
```

- [ ] **Step 2: Create shared types**

```ts
// apps/web/src/components/admin/social/types.ts
export type PostType = "preview" | "results";

export interface MatchItem {
  id: number;
  teamLabel: string;
  opponent: string;
  isHome: boolean;
  kickoffDate: string;
  kickoffTime: string;
  homeScore: number | null;
  guestScore: number | null;
}

export interface PlayerPhoto {
  id: number;
  filename: string;
  originalName: string;
  width: number;
  height: number;
}

export interface Background {
  id: number;
  filename: string;
  originalName: string;
  width: number;
  height: number;
  isDefault: boolean;
}

export interface PlayerPosition {
  x: number;
  y: number;
  scale: number;
}

export interface WizardState {
  step: 1 | 2 | 3 | 4;
  postType: PostType;
  calendarWeek: number;
  year: number;
  matches: MatchItem[];
  selectedPhotoId: number | null;
  selectedPhoto: PlayerPhoto | null;
  selectedBackgroundId: number | null;
  playerPosition: PlayerPosition;
}
```

- [ ] **Step 3: Add SWR keys**

Add to `apps/web/src/lib/swr-keys.ts`:
```ts
socialPlayerPhotos: "/admin/social/player-photos",
socialBackgrounds: "/admin/social/backgrounds",
socialMatches: (type: string, week: number, year: number) =>
  `/admin/social/matches?type=${type}&week=${week}&year=${year}`,
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/admin/social/types.ts apps/web/src/lib/swr-keys.ts apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): add social wizard types, SWR keys, and react-rnd"
```

---

### Task 2: Wizard container and Step 1 (Post Type & Week)

**Files:**
- Create: `apps/web/src/app/[locale]/admin/social/create/page.tsx`
- Create: `apps/web/src/components/admin/social/post-wizard.tsx`
- Create: `apps/web/src/components/admin/social/steps/post-type-step.tsx`

- [ ] **Step 1: Create page shell** (server component)

```tsx
// apps/web/src/app/[locale]/admin/social/create/page.tsx
import { PostWizard } from "@/components/admin/social/post-wizard";

export default function SocialCreatePage() {
  return (
    <div className="container mx-auto py-6">
      <PostWizard />
    </div>
  );
}
```

- [ ] **Step 2: Create wizard container** (`"use client"`)

Manages `WizardState`, renders the active step component, provides step navigation (breadcrumb + next/back). Initial state: `postType: "results"`, `calendarWeek: getISOWeek(now)`, `year: getYear(now)`.

- [ ] **Step 3: Create Step 1**

Two toggle buttons for post type (Preview / Results), two number inputs for calendar week and year. "Load Matches →" button advances to step 2.

- [ ] **Step 4: Verify it renders**

```bash
pnpm --filter @dragons/web dev
```
Navigate to `/admin/social/create`. Step 1 should render.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/[locale]/admin/social/ apps/web/src/components/admin/social/
git commit -m "feat(web): add social post wizard shell with step 1"
```

---

### Task 3: Step 2 — Match Review

**Files:**
- Create: `apps/web/src/components/admin/social/steps/match-review-step.tsx`

- [ ] **Step 1: Implement match review step**

On mount: fetch matches from `GET /admin/social/matches?type=...&week=...&year=...` via `fetchAPI`. Show loading/error/empty states.

Match list with:
- Up/down arrow buttons to reorder (simple swap, not drag-and-drop)
- ✕ button to remove
- Each row shows: team label, score or time, opponent, home/away badge
- Max 6 matches enforced (slice on load)
- "Select Assets →" button disabled if 0 matches

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/admin/social/steps/match-review-step.tsx
git commit -m "feat(web): add wizard step 2 (match review)"
```

---

### Task 4: Step 3 — Asset Selection

**Files:**
- Create: `apps/web/src/components/admin/social/photo-grid.tsx`
- Create: `apps/web/src/components/admin/social/steps/asset-select-step.tsx`

- [ ] **Step 1: Create PhotoGrid component**

Reusable grid component for both player photos and backgrounds:
- Renders items as clickable image thumbnails (aspect-square)
- Selected item gets a primary border highlight
- "+" button opens a hidden file input for uploading
- Upload via `fetch` with `FormData` (not `fetchAPI` since it needs multipart)
- Shows upload error messages
- Calls `onUploadComplete` to refresh the list after upload

- [ ] **Step 2: Create Step 3 — Asset Selection**

Two `PhotoGrid` instances: one for player photos, one for backgrounds. Auto-selects the default background on load. Stores selected photo object (with dimensions) in wizard state for the preview step. "Preview →" disabled until both are selected.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/admin/social/photo-grid.tsx apps/web/src/components/admin/social/steps/asset-select-step.tsx
git commit -m "feat(web): add wizard step 3 (asset selection)"
```

---

### Task 5: Step 4 — Preview with Drag/Resize and Download

**Files:**
- Create: `apps/web/src/components/admin/social/image-preview.tsx`
- Create: `apps/web/src/components/admin/social/steps/preview-step.tsx`

- [ ] **Step 1: Create ImagePreview component**

540x540 display canvas (half of 1080 for UI). `SCALE_FACTOR = 2` maps display coords to generation coords.

Layers:
1. Background `<img>` filling the canvas
2. Text overlay (CSS approximation of the Satori template — title, match rows, legend, footer). Add note that the generated image may differ slightly.
3. Player photo as a `<Rnd>` component:
   - `lockAspectRatio`
   - No `bounds` constraint (allows extending beyond canvas)
   - Initial size derived from actual photo dimensions (`PlayerPhoto.width`/`height`) and `scale`
   - `onDragStop` and `onResizeStop` update `playerPosition` in 1080-space coordinates

Away matches get an orange left border (matching the Satori template).

- [ ] **Step 2: Create Step 4 — Preview & Download**

Shows the `ImagePreview` component centered. Instructional text about drag/resize.

"Generate & Download" button:
1. `POST /admin/social/generate` with full wizard state as JSON
2. Receive PNG blob
3. Create object URL, trigger `<a>` download with filename `dragons-{type}-kw{week}.png`
4. Revoke object URL

Loading and error states for the generation call.

- [ ] **Step 3: Test the full flow manually**

```bash
pnpm dev
```
Walk through all 4 wizard steps, generate and download an image.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/admin/social/image-preview.tsx apps/web/src/components/admin/social/steps/preview-step.tsx
git commit -m "feat(web): add wizard step 4 (preview with drag/resize and download)"
```

---

### Task 6: Typecheck, lint, and AGENTS.md

- [ ] **Step 1: Typecheck**

```bash
pnpm typecheck
```

Fix any errors.

- [ ] **Step 2: Lint**

```bash
pnpm lint
```

Fix any issues.

- [ ] **Step 3: Update AGENTS.md**

Add to the endpoints section:
- `GET /admin/social/matches`
- `GET/POST/DELETE /admin/social/player-photos`
- `GET /admin/social/player-photos/:id/image`
- `GET/POST/DELETE /admin/social/backgrounds`
- `GET /admin/social/backgrounds/:id/image`
- `PATCH /admin/social/backgrounds/:id/default`
- `POST /admin/social/generate`

Add to data model section:
- `player_photos` table
- `social_backgrounds` table

Add to frontend section:
- `/admin/social/create` — social post wizard

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: resolve typecheck/lint issues and update AGENTS.md for social features"
```
