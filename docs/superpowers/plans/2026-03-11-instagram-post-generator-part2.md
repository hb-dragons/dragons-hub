# Instagram Post Generator — Part 2: Image Generation

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the server-side image generation pipeline: Satori JSX templates for text rendering, Sharp for layer compositing, and the `/generate` API endpoint.

**Architecture:** Satori renders JSX templates to SVG, @resvg/resvg-js converts SVG to PNG, Sharp composites three layers (background → player photo → text overlay) into the final 1080x1080 PNG. Fonts loaded from GCS and cached in memory.

**Tech Stack:** Satori, Sharp, @resvg/resvg-js, Hono, Zod 4

**Depends on:** Part 1 (DB schema, GCS storage, asset services, match query service)

---

## Import Conventions

```ts
import { db } from "../../config/database";
import { playerPhotos } from "@dragons/db/schema";
export { socialRoutes }; // named exports for routes
```

---

### Task 1: Configure JSX for API package and install dependencies

**Files:**
- Modify: `apps/api/tsconfig.json`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Add JSX config to API tsconfig**

Add to `compilerOptions`:
```json
"jsx": "react-jsx",
"jsxImportSource": "react"
```

Update `include`:
```json
"include": ["src/**/*.ts", "src/**/*.tsx"]
```

- [ ] **Step 2: Install dependencies**

```bash
pnpm --filter @dragons/api add -D @types/react
pnpm --filter @dragons/api add satori @resvg/resvg-js sharp
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm --filter @dragons/api typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/tsconfig.json apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): configure JSX and add satori/resvg/sharp dependencies"
```

---

### Task 2: Shared Satori template components

**Files:**
- Create: `apps/api/src/services/social/templates/shared.tsx`

- [ ] **Step 1: Create shared layout and types**

```tsx
// apps/api/src/services/social/templates/shared.tsx
import type { ReactNode } from "react";

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
}

export function PostLayout({ title, subtitle, matches, footer, renderMatchDetail }: PostLayoutProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: 1080, height: 1080, fontFamily: "League Spartan", color: "white", padding: "40px 50px" }}>
      {/* Title */}
      <div style={{ display: "flex", flexDirection: "column", marginBottom: 20 }}>
        <div style={{ fontSize: 80, fontWeight: 900, fontFamily: "Greater Theory", textTransform: "uppercase", letterSpacing: 2 }}>
          {title}
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, opacity: 0.9 }}>{subtitle}</div>
      </div>

      {/* Match rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
        {matches.map((match, i) => (
          <div key={i} style={{
            display: "flex",
            flexDirection: "column",
            padding: "12px 16px",
            backgroundColor: match.isHome ? "transparent" : "rgba(249, 115, 22, 0.15)",
            borderLeft: match.isHome ? "none" : "4px solid rgba(249, 115, 22, 0.8)",
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <div style={{ fontSize: 36, fontWeight: 800 }}>{match.teamLabel}</div>
              {renderMatchDetail(match)}
            </div>
            <div style={{ fontSize: 24, opacity: 0.85 }}>vs {match.opponent}</div>
          </div>
        ))}
      </div>

      {/* Home/Away legend */}
      <div style={{ display: "flex", justifyContent: "center", gap: 24, marginBottom: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 600, padding: "6px 20px" }}>HEIM</div>
        <div style={{ fontSize: 20, fontWeight: 600, padding: "6px 20px", backgroundColor: "rgba(249, 115, 22, 0.8)" }}>AUSW.</div>
      </div>

      {/* Footer */}
      <div style={{ display: "flex", fontSize: 14, justifyContent: "center", opacity: 0.7, textTransform: "uppercase", letterSpacing: 1 }}>
        {footer}
      </div>
    </div>
  );
}
```

Away matches get an orange left border and subtle background to match the original design.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/services/social/templates/shared.tsx
git commit -m "feat(api): add shared Satori template layout"
```

---

### Task 3: Preview and Results templates

**Files:**
- Create: `apps/api/src/services/social/templates/weekend-preview.tsx`
- Create: `apps/api/src/services/social/templates/weekend-results.tsx`

- [ ] **Step 1: Create preview template**

```tsx
// apps/api/src/services/social/templates/weekend-preview.tsx
import { PostLayout, type MatchRow } from "./shared";

interface Props { calendarWeek: number; matches: MatchRow[]; footer: string; }

export function WeekendPreview({ calendarWeek, matches, footer }: Props) {
  return (
    <PostLayout
      title="SPIELTAG"
      subtitle={`KALENDERWOCHE ${calendarWeek}`}
      matches={matches}
      footer={footer}
      renderMatchDetail={(match) => (
        <div style={{ fontSize: 36, fontWeight: 700 }}>| {match.kickoffTime}</div>
      )}
    />
  );
}
```

- [ ] **Step 2: Create results template**

```tsx
// apps/api/src/services/social/templates/weekend-results.tsx
import { PostLayout, type MatchRow } from "./shared";

interface Props { calendarWeek: number; matches: MatchRow[]; footer: string; }

export function WeekendResults({ calendarWeek, matches, footer }: Props) {
  return (
    <PostLayout
      title="ERGEBNISSE"
      subtitle={`KALENDERWOCHE ${calendarWeek}`}
      matches={matches}
      footer={footer}
      renderMatchDetail={(match) => (
        <div style={{ fontSize: 36, fontWeight: 700 }}>| {match.homeScore}:{match.guestScore}</div>
      )}
    />
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/social/templates/
git commit -m "feat(api): add Satori templates for preview and results posts"
```

---

### Task 4: Image generation service

**Files:**
- Create: `apps/api/src/services/social/social-image.service.ts`
- Create: `apps/api/src/services/social/social-image.service.test.ts`

- [ ] **Step 1: Write failing tests**

Test `generatePostImage` for both "results" and "preview" types. Verify:
- Returns a `Buffer`
- Calls `downloadFromGcs` for background, player photo, and both fonts
- Mock `satori`, `@resvg/resvg-js`, `sharp`, and `./gcs-storage.service`

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm --filter @dragons/api test -- src/services/social/social-image.service.test.ts
```

- [ ] **Step 3: Implement**

```ts
// apps/api/src/services/social/social-image.service.ts
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { downloadFromGcs } from "./gcs-storage.service";
import { WeekendPreview } from "./templates/weekend-preview";
import { WeekendResults } from "./templates/weekend-results";
import type { MatchRow } from "./templates/shared";

const SIZE = 1080;

// Font cache — loaded from GCS on first use
let leagueSpartanFont: ArrayBuffer | null = null;
let greaterTheoryFont: ArrayBuffer | null = null;

async function loadFonts() {
  if (leagueSpartanFont && greaterTheoryFont) return;
  const [lsBuf, gtBuf] = await Promise.all([
    downloadFromGcs("assets/fonts/LeagueSpartan-VariableFont_wght.ttf"),
    downloadFromGcs("assets/fonts/greatertheory.otf"),
  ]);
  leagueSpartanFont = lsBuf.buffer.slice(lsBuf.byteOffset, lsBuf.byteOffset + lsBuf.byteLength) as ArrayBuffer;
  greaterTheoryFont = gtBuf.buffer.slice(gtBuf.byteOffset, gtBuf.byteOffset + gtBuf.byteLength) as ArrayBuffer;
}

interface GenerateParams {
  type: "preview" | "results";
  calendarWeek: number;
  matches: MatchRow[];
  footer: string;
  backgroundFilename: string;
  playerPhotoFilename: string;
  playerPosition: { x: number; y: number; scale: number };
}

export async function generatePostImage(params: GenerateParams): Promise<Buffer> {
  await loadFonts();

  const { type, calendarWeek, matches, footer, backgroundFilename, playerPhotoFilename, playerPosition } = params;

  // 1. Render text via Satori → SVG
  const element = type === "preview"
    ? WeekendPreview({ calendarWeek, matches, footer })
    : WeekendResults({ calendarWeek, matches, footer });

  const svg = await satori(element, {
    width: SIZE, height: SIZE,
    fonts: [
      { name: "League Spartan", data: leagueSpartanFont!, weight: 400, style: "normal" },
      { name: "League Spartan", data: leagueSpartanFont!, weight: 700, style: "normal" },
      { name: "League Spartan", data: leagueSpartanFont!, weight: 800, style: "normal" },
      { name: "Greater Theory", data: greaterTheoryFont!, weight: 900, style: "normal" },
    ],
  });

  // 2. SVG → PNG via resvg
  const textLayerPng = new Resvg(svg, { fitTo: { mode: "width", value: SIZE } }).render().asPng();

  // 3. Fetch images from GCS
  const [bgBuffer, playerBuffer] = await Promise.all([
    downloadFromGcs(`backgrounds/${backgroundFilename}`),
    downloadFromGcs(`player-photos/${playerPhotoFilename}`),
  ]);

  // 4. Scale player photo
  const meta = await sharp(playerBuffer).metadata();
  const w = Math.round((meta.width || 500) * playerPosition.scale);
  const h = Math.round((meta.height || 750) * playerPosition.scale);
  const resizedPlayer = await sharp(playerBuffer).resize(w, h).ensureAlpha().png().toBuffer();

  // 5. Composite: background → player → text
  return sharp(bgBuffer)
    .composite([
      { input: resizedPlayer, left: Math.round(playerPosition.x), top: Math.round(playerPosition.y) },
      { input: Buffer.from(textLayerPng), left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}
```

**Risk note:** Greater Theory is a decorative font. If Satori renders it incorrectly, fall back to pre-rendering the title as a PNG asset and compositing it as a fourth layer. Test early.

- [ ] **Step 4: Run tests — expect PASS**
- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/social/social-image.service.ts apps/api/src/services/social/social-image.service.test.ts
git commit -m "feat(api): add image generation service with Satori + Sharp compositing"
```

---

### Task 5: Generate endpoint

**Files:**
- Modify: `apps/api/src/routes/admin/social.routes.ts`
- Modify: `apps/api/src/routes/admin/social.routes.test.ts`

- [ ] **Step 1: Add route test for POST /generate**

Test: valid body → 200 with `Content-Type: image/png`; invalid body → 400; missing photo/background → 404.

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Add generate endpoint**

```ts
socialRoutes.post("/generate", async (c) => {
  const body = generateBodySchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const { type, calendarWeek, year, matches: matchInputs, playerPhotoId, backgroundId, playerPosition } = body.data;

  const photo = await getPlayerPhotoById(playerPhotoId);
  if (!photo) return c.json({ error: "Player photo not found" }, 404);

  const bg = await getBackgroundById(backgroundId);
  if (!bg) return c.json({ error: "Background not found" }, 404);

  // Resolve selected matches in order
  const weekMatches = await getWeekendMatches({ type, week: calendarWeek, year });
  const orderedMatches = matchInputs
    .sort((a, b) => a.order - b.order)
    .map((input) => weekMatches.find((m) => m.id === input.matchId))
    .filter(Boolean)
    .map((m) => ({
      teamLabel: m!.teamLabel,
      opponent: m!.opponent,
      isHome: m!.isHome,
      kickoffTime: m!.kickoffTime,
      homeScore: m!.homeScore ?? undefined,
      guestScore: m!.guestScore ?? undefined,
    }));

  if (orderedMatches.length === 0) return c.json({ error: "No valid matches found" }, 400);

  // TODO: Pull footer from app_settings
  const footer = "HEIMHALLE: FRIEDRICH-EBERT-SCHULE | SALZWEG 34 30455 HANNOVER";

  try {
    const png = await generatePostImage({
      type, calendarWeek, matches: orderedMatches, footer,
      backgroundFilename: bg.filename,
      playerPhotoFilename: photo.filename,
      playerPosition,
    });

    return new Response(png, {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(png.length),
        "Content-Disposition": `attachment; filename="dragons-${type}-kw${calendarWeek}.png"`,
      },
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Image generation failed" }, 500);
  }
});
```

- [ ] **Step 4: Run tests — expect PASS**
- [ ] **Step 5: Run full API test suite + coverage**

```bash
pnpm --filter @dragons/api test
pnpm --filter @dragons/api coverage
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/admin/social.routes.ts apps/api/src/routes/admin/social.routes.test.ts
git commit -m "feat(api): add image generation endpoint with match resolution"
```
