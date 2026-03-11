# Instagram Post Generator — Design Spec

## Overview

Server-side image generation system for creating Instagram posts for the Dragons basketball club. Generates two post types from match data: **weekend preview** (upcoming games with kickoff times) and **weekend results** (played games with scores). Posts are generated via an admin UI wizard, previewed, and downloaded as PNG images.

## Post Types

### Weekend Preview ("Spieltag")
- Title: "SPIELTAG" + ISO 8601 calendar week number
- Match rows: team label, kickoff time, "vs [opponent]", home/away indicator, opponent logo placeholder
- Player photo overlay
- Background image from pool
- Footer: home venue info

### Weekend Results ("Ergebnisse")
- Title: "ERGEBNISSE" + ISO 8601 calendar week number
- Match rows: team label, score, "vs [opponent]", home/away indicator, opponent logo placeholder
- Player photo overlay
- Background image from pool
- Footer: home venue info
- W/L brush-style indicators deferred to a later phase

### Shared Layout
- 1080x1080px square (Instagram standard)
- Fonts: Greater Theory (title), League Spartan variable (body text)
- Green/orange geometric background (uploadable, selectable from pool)
- Player photo: positioned and scaled by user via drag & resize
- Maximum **6 match rows** per image (layout constraint). Wizard enforces this limit in Step 2.

### Team Label Resolution
The team label displayed on each match row uses this fallback chain from the `teams` table:
`customName` → `nameShort` → `name`

### Home / Away Determination
Derived from match data: if the Dragons team is the `homeTeamApiId`, the match is "HEIM"; if `guestTeamApiId`, it is "AUSW." The `isOwnClub` flag on the team identifies which side is the Dragons.

### Calendar Week Definition
"Calendar week" means **ISO 8601 week** (Monday start). The match query returns all own-club matches within that full ISO week (Monday–Sunday), not just Saturday/Sunday. Use `date-fns/getISOWeek` for week calculation.

## Architecture

### Image Generation Pipeline (API)

Service: `apps/api/src/services/social/social-image.service.ts`

Layering via **Sharp** compositing:
1. Background PNG (1080x1080) — selected from pool
2. Player photo — composited at user-specified position and scale
3. Text overlay — rendered via **Satori** (JSX → SVG), converted to PNG via **@resvg/resvg-js**, then composited on top

Two Satori templates sharing a base layout:
- `apps/api/src/services/social/templates/weekend-preview.tsx` — kickoff times
- `apps/api/src/services/social/templates/weekend-results.tsx` — scores

Note: The API's `tsconfig.json` needs `jsx: "react-jsx"` and `jsxImportSource` configured for the Satori template files.

New dependencies: `satori`, `sharp`, `@resvg/resvg-js`, `@google-cloud/storage`

Static assets (fonts) loaded once at startup as `ArrayBuffer` from `apps/api/src/assets/social/`. Satori requires fonts in this format.

**Risk**: Greater Theory is a decorative display font. Satori may not support all its OpenType features. This should be validated early in implementation — if it fails, fall back to rendering the title as a pre-rendered PNG asset.

### Admin UI Wizard

Page: `/admin/social/create`

**Step 1 — Post Type & Weekend**
- Select "Preview" or "Results"
- Select calendar week (defaults to current/next weekend)
- Auto-loads matching games from DB
- Results: only matches with scores; Preview: only upcoming matches
- **Empty state**: if no matches found, show message with option to select a different week

**Step 2 — Review Matches**
- List of auto-selected matches (max 6)
- Drag & drop to reorder
- Remove unwanted matches
- Each row: team label, opponent, score or kickoff time, home/away
- **Validation**: at least 1 match required to proceed

**Step 3 — Player Photo & Background**
- Grid of player photos from pool, click to select
- Upload new photos inline
- Background image selector (pool with default)
- Drag & resize library: `react-rnd` (well-maintained, supports both drag and resize)

**Step 4 — Position & Preview**
- Full 1080x1080 live HTML/CSS preview
- Player photo as draggable, resizable overlay using `react-rnd`
- Drag to reposition, corner handles to scale
- Background visible underneath
- **Coordinate system**: origin (0, 0) is top-left of the 1080x1080 canvas. `x` and `y` are pixel offsets. `scale` is a multiplier where 1.0 = original size.
- "Generate" calls API, returns final PNG
- "Download" saves the PNG
- **Error state**: if generation fails, show error message with retry option

Wizard state is client-side only (React state). No draft persistence.

### API Endpoints

Route file: `apps/api/src/routes/admin/social.routes.ts`
Schema file: `apps/api/src/routes/admin/social.schemas.ts` (Zod validation for all inputs)

```
GET    /admin/social/matches?type=preview|results&week=10&year=2026
       → Weekend matches filtered by type

POST   /admin/social/generate
       → Body: { type, matches[], playerPhotoId, playerPosition: {x, y, scale}, backgroundId }
       → Returns: PNG buffer (Content-Type: image/png)
       → Not cached; regenerates on every call

GET    /admin/social/player-photos
GET    /admin/social/player-photos/:id/image → Proxies GCS signed URL (returns image bytes)
POST   /admin/social/player-photos          (multipart upload)
DELETE /admin/social/player-photos/:id

GET    /admin/social/backgrounds
GET    /admin/social/backgrounds/:id/image   → Proxies GCS signed URL (returns image bytes)
POST   /admin/social/backgrounds             (multipart upload)
DELETE /admin/social/backgrounds/:id
PATCH  /admin/social/backgrounds/:id/default
```

### Upload Constraints

Applied to both player photos and backgrounds:
- **Max file size**: 10 MB
- **Allowed types**: `image/png`, `image/jpeg`, `image/webp`
- **Backgrounds**: must be at least 1080x1080px. Larger images are auto-resized to 1080x1080 via Sharp on upload.
- **Player photos**: no dimension constraint (they are positioned/scaled in the wizard)

### Data Model

**`player_photos` table** (`packages/db/src/schema/player-photos.ts`)
| Column         | Type      | Notes                |
|---------------|-----------|----------------------|
| id            | serial    | PK                   |
| filename      | string    | Stored filename      |
| original_name | string    | Original upload name |
| width         | integer   | Image width in px    |
| height        | integer   | Image height in px   |
| created_at    | timestamp | Auto-set             |
| updated_at    | timestamp | Auto-set             |

**`social_backgrounds` table** (`packages/db/src/schema/social-backgrounds.ts`)
| Column         | Type      | Notes                    |
|---------------|-----------|--------------------------|
| id            | serial    | PK                       |
| filename      | string    | Stored filename          |
| original_name | string    | Original upload name     |
| width         | integer   | Image width in px        |
| height        | integer   | Image height in px       |
| is_default    | boolean   | Pre-selected in wizard   |
| created_at    | timestamp | Auto-set                 |
| updated_at    | timestamp | Auto-set                 |

Both tables exported from `packages/db/src/schema/index.ts`. Drizzle migration generated and applied. `AGENTS.md` updated with new tables.

### File Storage — Google Cloud Storage

All uploaded images (player photos, backgrounds) and fonts are stored in a **private GCS bucket**. No files are stored on the local filesystem (stateless deployment on GCP).

**Bucket structure:**
```
gs://<bucket>/
  player-photos/<uuid>.<ext>
  backgrounds/<uuid>.<ext>
  assets/fonts/LeagueSpartan-VariableFont_wght.ttf
  assets/fonts/greatertheory.otf
```

**Access pattern:**
- Bucket is **not public**. All objects are private.
- The API acts as a proxy: `GET /admin/social/player-photos/:id/image` generates a short-lived **signed URL** (15 min TTL), fetches the image from GCS, and streams it to the client. The signed URL never reaches the browser.
- For image generation, the service fetches assets directly from GCS using the service account credentials.
- Fonts are cached in memory after first load (same as before, just sourced from GCS instead of filesystem).

**Infrastructure (OpenTofu):**
- GCS bucket with uniform bucket-level access (no per-object ACLs)
- Service account with `roles/storage.objectAdmin` on the bucket
- Workload Identity Federation or key-based auth depending on GCP deployment target

**New env vars:**
- `GCS_BUCKET_NAME` — the bucket for social assets
- `GCS_PROJECT_ID` — GCP project ID (optional if running on GCP with default credentials)

Add to Zod schema in `config/env.ts` and `.env.example`.

**Local development:** For local dev, use a real GCS bucket (dev/staging) or the GCS emulator via `STORAGE_EMULATOR_HOST` env var. The `@google-cloud/storage` SDK supports both transparently.

### Instagram Publishing (Future)

Not in scope for initial implementation. Current flow ends with PNG download.

When added later:
- Instagram Graph API v21+ via Business account
- "Post to Instagram" button after download step
- Requires: Facebook App, Instagram Business account linked to Facebook Page
- Env vars: `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_BUSINESS_ACCOUNT_ID`
- Endpoint: `POST /admin/social/publish` (accepts generated image ID or buffer)

### Assets Required

Exported from existing Photoshop file:
- Background PNG(s) — 1080x1080, no text/player (uploaded via admin UI)
- Player photos — PNG with transparent background (uploaded via admin UI)
- Font: League Spartan variable (`LeagueSpartan-VariableFont_wght.ttf`)
- Font: Greater Theory (`greatertheory.otf`)

Opponent logos: placeholder for now, real logo system added later.

## Out of Scope

- W/L brush-style letter indicators (later phase)
- Opponent team logos (placeholder circles for now)
- Instagram API publishing (later phase)
- Post history / saved drafts
- Automated scheduling (cron-based generation)
