# Instagram Post Generator — Part 1: Foundation & Asset Management

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the database tables, GCS integration, and API endpoints for managing player photos, backgrounds, and querying match data for social posts.

**Architecture:** Two new DB tables (`player_photos`, `social_backgrounds`), a GCS storage service for file operations, CRUD services for each asset type, a match query service, and Hono routes exposing everything under `/admin/social/*`.

**Tech Stack:** @google-cloud/storage, Sharp (for image metadata/resize), date-fns, Hono, Drizzle ORM, Zod 4

---

## Import Conventions

```ts
import { db } from "../../config/database";
import { playerPhotos } from "@dragons/db/schema";
export { socialRoutes }; // named exports for routes
```

---

### Task 1: Add player_photos and social_backgrounds DB schema

**Files:**
- Create: `packages/db/src/schema/player-photos.ts`
- Create: `packages/db/src/schema/social-backgrounds.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create `player_photos` schema**

```ts
// packages/db/src/schema/player-photos.ts
import { integer, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

export const playerPhotos = pgTable("player_photos", {
  id: serial("id").primaryKey(),
  filename: varchar("filename", { length: 255 }).notNull(),
  originalName: varchar("original_name", { length: 255 }).notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type PlayerPhoto = typeof playerPhotos.$inferSelect;
export type NewPlayerPhoto = typeof playerPhotos.$inferInsert;
```

- [ ] **Step 2: Create `social_backgrounds` schema**

```ts
// packages/db/src/schema/social-backgrounds.ts
import { boolean, integer, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

export const socialBackgrounds = pgTable("social_backgrounds", {
  id: serial("id").primaryKey(),
  filename: varchar("filename", { length: 255 }).notNull(),
  originalName: varchar("original_name", { length: 255 }).notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SocialBackground = typeof socialBackgrounds.$inferSelect;
export type NewSocialBackground = typeof socialBackgrounds.$inferInsert;
```

- [ ] **Step 3: Export from schema index**

Add to `packages/db/src/schema/index.ts`:
```ts
export * from "./player-photos";
export * from "./social-backgrounds";
```

- [ ] **Step 4: Generate and apply migration**

```bash
pnpm --filter @dragons/db db:generate
pnpm --filter @dragons/db db:migrate
```

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/player-photos.ts packages/db/src/schema/social-backgrounds.ts packages/db/src/schema/index.ts packages/db/drizzle/
git commit -m "feat(db): add player_photos and social_backgrounds tables"
```

---

### Task 2: GCS env vars and client config

**Files:**
- Modify: `apps/api/src/config/env.ts`
- Create: `apps/api/src/config/gcs.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add GCS env vars** (optional, so existing tests/devs don't break)

In `apps/api/src/config/env.ts`:
```ts
GCS_BUCKET_NAME: z.string().min(1).optional(),
GCS_PROJECT_ID: z.string().min(1).optional(),
```

- [ ] **Step 2: Update `.env.example`**

```
GCS_BUCKET_NAME=dragons-social-assets
GCS_PROJECT_ID=your-gcp-project-id
```

- [ ] **Step 3: Create GCS client singleton**

```ts
// apps/api/src/config/gcs.ts
import { Storage } from "@google-cloud/storage";
import { env } from "./env";

let storage: Storage | null = null;

export function getGcsStorage(): Storage {
  if (!storage) {
    storage = new Storage({ projectId: env.GCS_PROJECT_ID });
  }
  return storage;
}

export function getGcsBucket() {
  const bucketName = env.GCS_BUCKET_NAME;
  if (!bucketName) {
    throw new Error("GCS_BUCKET_NAME is required for social features");
  }
  return getGcsStorage().bucket(bucketName);
}
```

- [ ] **Step 4: Install dependency**

```bash
pnpm --filter @dragons/api add @google-cloud/storage
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/config/env.ts apps/api/src/config/gcs.ts apps/api/package.json .env.example pnpm-lock.yaml
git commit -m "feat(api): add GCS configuration and client"
```

---

### Task 3: GCS storage service

**Files:**
- Create: `apps/api/src/services/social/gcs-storage.service.ts`
- Create: `apps/api/src/services/social/gcs-storage.service.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// apps/api/src/services/social/gcs-storage.service.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFile = {
  save: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
  download: vi.fn().mockResolvedValue([Buffer.from("image-data")]),
};
const mockBucket = { file: vi.fn().mockReturnValue(mockFile) };

vi.mock("../../config/gcs", () => ({
  getGcsBucket: vi.fn().mockReturnValue(mockBucket),
}));

import { uploadToGcs, downloadFromGcs, deleteFromGcs } from "./gcs-storage.service";

describe("gcs-storage.service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uploads buffer to correct path", async () => {
    const buffer = Buffer.from("test");
    await uploadToGcs("player-photos/abc.png", buffer, "image/png");
    expect(mockBucket.file).toHaveBeenCalledWith("player-photos/abc.png");
    expect(mockFile.save).toHaveBeenCalledWith(buffer, { metadata: { contentType: "image/png" }, resumable: false });
  });

  it("downloads buffer", async () => {
    const result = await downloadFromGcs("player-photos/abc.png");
    expect(result).toBeInstanceOf(Buffer);
  });

  it("deletes file", async () => {
    await deleteFromGcs("player-photos/abc.png");
    expect(mockFile.delete).toHaveBeenCalledWith({ ignoreNotFound: true });
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm --filter @dragons/api test -- src/services/social/gcs-storage.service.test.ts
```

- [ ] **Step 3: Implement**

```ts
// apps/api/src/services/social/gcs-storage.service.ts
import { getGcsBucket } from "../../config/gcs";

export async function uploadToGcs(path: string, buffer: Buffer, contentType: string): Promise<void> {
  const file = getGcsBucket().file(path);
  await file.save(buffer, { metadata: { contentType }, resumable: false });
}

export async function downloadFromGcs(path: string): Promise<Buffer> {
  const [buffer] = await getGcsBucket().file(path).download();
  return buffer;
}

export async function deleteFromGcs(path: string): Promise<void> {
  await getGcsBucket().file(path).delete({ ignoreNotFound: true });
}
```

- [ ] **Step 4: Run tests — expect PASS**
- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/social/gcs-storage.service.ts apps/api/src/services/social/gcs-storage.service.test.ts
git commit -m "feat(api): add GCS storage service"
```

---

### Task 4: Upload fonts to GCS

Fonts are stored in GCS (not bundled locally). This is a manual/infra step.

- [ ] **Step 1: Upload fonts**

```bash
gsutil cp /Users/jn/Downloads/League_Spartan/LeagueSpartan-VariableFont_wght.ttf gs://${GCS_BUCKET_NAME}/assets/fonts/
gsutil cp /Users/jn/Downloads/greater-theory-font/greatertheory.otf gs://${GCS_BUCKET_NAME}/assets/fonts/
```

No commit needed — fonts live in GCS.

---

### Task 5: Zod schemas

**Files:**
- Create: `apps/api/src/routes/admin/social.schemas.ts`

- [ ] **Step 1: Create schemas**

```ts
// apps/api/src/routes/admin/social.schemas.ts
import { z } from "zod";

export const matchesQuerySchema = z.object({
  type: z.enum(["preview", "results"]),
  week: z.coerce.number().int().min(1).max(53),
  year: z.coerce.number().int().min(2020).max(2100),
});

export type MatchesQuery = z.infer<typeof matchesQuerySchema>;

export const generateBodySchema = z.object({
  type: z.enum(["preview", "results"]),
  calendarWeek: z.number().int().min(1).max(53),
  year: z.number().int().min(2020).max(2100),
  matches: z.array(z.object({
    matchId: z.number().int(),
    order: z.number().int(),
  })).min(1).max(6),
  playerPhotoId: z.number().int(),
  backgroundId: z.number().int(),
  playerPosition: z.object({
    x: z.number(),
    y: z.number(),
    scale: z.number().min(0.1).max(5),
  }),
});

export type GenerateBody = z.infer<typeof generateBodySchema>;

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/routes/admin/social.schemas.ts
git commit -m "feat(api): add Zod schemas for social routes"
```

---

### Task 6: Player photo service

**Files:**
- Create: `apps/api/src/services/social/player-photo.service.ts`
- Create: `apps/api/src/services/social/player-photo.service.test.ts`

- [ ] **Step 1: Write failing tests**

Test `listPlayerPhotos`, `getPlayerPhotoById`, `uploadPlayerPhoto` (including rejection of invalid types/sizes), `deletePlayerPhoto`, `getPlayerPhotoImage`. Mock `../../config/database`, `@dragons/db/schema`, `./gcs-storage.service`, and `sharp`.

- [ ] **Step 2: Run tests — expect FAIL**
- [ ] **Step 3: Implement**

```ts
// apps/api/src/services/social/player-photo.service.ts
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { db } from "../../config/database";
import { playerPhotos } from "@dragons/db/schema";
import { eq, desc } from "drizzle-orm";
import sharp from "sharp";
import { uploadToGcs, downloadFromGcs, deleteFromGcs } from "./gcs-storage.service";

const UPLOAD_PREFIX = "player-photos";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

export async function listPlayerPhotos() {
  return db.select().from(playerPhotos).orderBy(desc(playerPhotos.createdAt));
}

export async function getPlayerPhotoById(id: number) {
  const [record] = await db.select().from(playerPhotos).where(eq(playerPhotos.id, id));
  return record ?? null;
}

export async function uploadPlayerPhoto(buffer: Buffer, originalName: string, contentType: string) {
  if (!ALLOWED_TYPES.includes(contentType)) throw new Error(`Invalid file type: ${contentType}. Allowed: ${ALLOWED_TYPES.join(", ")}`);
  if (buffer.length > MAX_FILE_SIZE) throw new Error(`File too large: ${buffer.length} bytes. Max: ${MAX_FILE_SIZE}`);

  const metadata = await sharp(buffer).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Could not read image dimensions");

  const ext = extname(originalName) || ".png";
  const filename = `${randomUUID()}${ext}`;
  await uploadToGcs(`${UPLOAD_PREFIX}/${filename}`, buffer, contentType);

  const [record] = await db.insert(playerPhotos).values({ filename, originalName, width: metadata.width, height: metadata.height }).returning();
  return record;
}

export async function deletePlayerPhoto(id: number) {
  const [record] = await db.delete(playerPhotos).where(eq(playerPhotos.id, id)).returning();
  if (record) await deleteFromGcs(`${UPLOAD_PREFIX}/${record.filename}`);
  return record ?? null;
}

export async function getPlayerPhotoImage(filename: string): Promise<Buffer> {
  return downloadFromGcs(`${UPLOAD_PREFIX}/${filename}`);
}
```

- [ ] **Step 4: Run tests — expect PASS**
- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/social/player-photo.service.ts apps/api/src/services/social/player-photo.service.test.ts
git commit -m "feat(api): add player photo service with GCS upload/download/delete"
```

---

### Task 7: Background service

**Files:**
- Create: `apps/api/src/services/social/background.service.ts`
- Create: `apps/api/src/services/social/background.service.test.ts`

Same pattern as Task 6 with these differences:
- `uploadBackground` rejects images < 1080x1080, resizes to 1080x1080 via `sharp().resize(1080, 1080, { fit: "cover" }).png().toBuffer()`
- `setDefaultBackground(id)` uses a transaction: unset all `isDefault`, then set the target
- `getBackgroundById(id)` for single record lookup

- [ ] **Step 1: Write failing tests** (including resize and setDefault)
- [ ] **Step 2: Run tests — expect FAIL**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run tests — expect PASS**
- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/social/background.service.ts apps/api/src/services/social/background.service.test.ts
git commit -m "feat(api): add background service with GCS upload and auto-resize"
```

---

### Task 8: Match social query service

**Files:**
- Create: `apps/api/src/services/social/match-social.service.ts`
- Create: `apps/api/src/services/social/match-social.service.test.ts`

- [ ] **Step 1: Install date-fns**

```bash
pnpm --filter @dragons/api add date-fns
```

- [ ] **Step 2: Write failing tests**

Test that `getWeekendMatches({ type, week, year })`:
- Returns `SocialMatchItem[]` with `teamLabel`, `opponent`, `isHome`, scores/times
- Resolves team labels via `customName → nameShort → name`
- Correctly determines home/away from `isOwnClub`

- [ ] **Step 3: Run tests — expect FAIL**
- [ ] **Step 4: Implement**

Key logic:
- Calculate ISO week range using `startOfISOWeek`/`endOfISOWeek` from `date-fns`
- Join matches with both home and guest teams (aliased subqueries)
- Filter: date range + score condition (results = has score, preview = no score)
- Post-filter: only own-club matches (where either side `isOwnClub`)
- Map to `SocialMatchItem` with team label resolution

```ts
export interface SocialMatchItem {
  id: number;
  teamLabel: string;
  opponent: string;
  isHome: boolean;
  kickoffDate: string;
  kickoffTime: string;
  homeScore: number | null;
  guestScore: number | null;
}

function resolveTeamLabel(team: { customName: string | null; nameShort: string | null; name: string }): string {
  return team.customName || team.nameShort || team.name;
}
```

- [ ] **Step 5: Run tests — expect PASS**
- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/social/match-social.service.ts apps/api/src/services/social/match-social.service.test.ts apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): add match query service for social posts"
```

---

### Task 9: Social admin routes (asset management + matches)

**Files:**
- Create: `apps/api/src/routes/admin/social.routes.ts`
- Create: `apps/api/src/routes/admin/social.routes.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Write failing route tests**

Test all endpoints:
- `GET /admin/social/player-photos` → 200
- `GET /admin/social/player-photos/:id/image` → 200 (found), 404 (not found)
- `POST /admin/social/player-photos` → 201
- `DELETE /admin/social/player-photos/:id` → 200 (found), 404 (not found)
- `GET /admin/social/backgrounds` → 200
- `GET /admin/social/backgrounds/:id/image` → 200
- `POST /admin/social/backgrounds` → 201
- `DELETE /admin/social/backgrounds/:id` → 200
- `PATCH /admin/social/backgrounds/:id/default` → 200
- `GET /admin/social/matches?type=results&week=10&year=2026` → 200
- `GET /admin/social/matches` (no params) → 400

- [ ] **Step 2: Run tests — expect FAIL**
- [ ] **Step 3: Implement routes**

All upload endpoints catch service errors and return 400. Image proxy endpoints use `getPlayerPhotoById`/`getBackgroundById` (not `listAll`), set `Content-Type`, `Content-Length`, and `Cache-Control` headers.

Use named export: `export { socialRoutes };`

- [ ] **Step 4: Mount in `routes/index.ts`**

```ts
import { socialRoutes } from "./admin/social.routes";
routes.route("/admin/social", socialRoutes);
```

- [ ] **Step 5: Run tests — expect PASS**
- [ ] **Step 6: Run full API test suite**: `pnpm --filter @dragons/api test`
- [ ] **Step 7: Run coverage**: `pnpm --filter @dragons/api coverage`
- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/admin/social.routes.ts apps/api/src/routes/admin/social.routes.test.ts apps/api/src/routes/index.ts
git commit -m "feat(api): add social admin routes for photos, backgrounds, and matches"
```
