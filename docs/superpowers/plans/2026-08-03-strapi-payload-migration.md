# Strapi → Payload Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all content and media from the legacy Strapi 5 into production Payload with a scripted, re-runnable migration, and render the three contact-page sections that would otherwise be lost at cutover.

**Architecture:** Four parts in order. (1) `apps/cms` gains the fields, the `referees` collection and the drafts settings that let every Strapi field land somewhere, sealed by one generated DB migration. (2) The rebuild-dispatch hook learns to honour a `?skipRebuild=true` query parameter, because Payload's REST API cannot carry `req.context`. (3) A one-off script under `apps/cms/scripts/migrate-strapi/` reads Strapi over HTTPS and writes Payload over REST with the build user's API key — pure mappers separated from all network I/O. (4) `apps/site` filters the newly drafted collections, switches shop prices to numbers, and renders Vorstand/Ehrenamtliche/Refs directly.

**Tech Stack:** Payload 3.87.0 (pinned), Next 16.2.6, Postgres via `@payloadcms/db-postgres`, Astro (apps/site), vitest 4, pnpm 11.5.1 + turbo, `tsx` for the one-off script, `jsdom` + `@payloadcms/richtext-lexical`'s `convertHTMLToLexical` for rich text.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-03-strapi-payload-migration-design.md`. Decisions are referenced as D1–D12; read it before starting.
- **Payload version is pinned at exactly `3.87.0`** across `payload`, `@payloadcms/db-postgres`, `@payloadcms/next`, `@payloadcms/richtext-lexical`, `@payloadcms/storage-gcs`. Never bump as a side effect.
- **`apps/cms` coverage floors:** branches 91, functions 100, lines 98, statements 98. Ratchet up, never lower.
- **`apps/site` coverage floors:** branches 97, functions 100, lines 99, statements 99. Ratchet up, never lower.
- `apps/cms` coverage counts `src/**/*.ts` only. `apps/site` coverage counts `src/**/*.ts` only — `.astro` and `.tsx` are **not** counted, so logic that needs coverage must live in a `.ts` module.
- **Never lower a coverage threshold to make a build pass.** Extract the logic into a testable `.ts` seam instead.
- `apps/cms/src/collections/content-contract.test.ts` is the guard on field names — the site loaders and the migration script both depend on them. **Every schema change in Tasks 1–3 must update it in the same commit.**
- Package manager is **pnpm**, run through turbo. Use `pnpm --filter @dragons/cms <script>` / `pnpm --filter @dragons/site <script>`.
- Commit style: conventional commits. Do **not** push or open a PR unless asked.
- Branch: `feat/cms-strapi-migration` (already exists, off `origin/main`, carries the spec commits).
- **Secrets never enter the repo.** `STRAPI_TOKEN` and `CMS_API_TOKEN` come from the environment. The Strapi token for local runs is at `/private/tmp/claude-501/-Users-jn-git-dragons-cms/c447e72f-f5ba-49c9-864a-fee562527ad8/scratchpad/.strapi_token` (session scratchpad, outside the repo).
- Strapi is **v5.33.0**: documents are flat (no `attributes` wrapper), carry a `documentId`, and use `status=draft|published` — **not** v4's `publicationState=preview`.

## Environment setup (do this once, before Task 1)

Tasks 4, 9 and 10 need a running local Postgres and a `.env`. `apps/cms/.env` is gitignored and may not exist.

```bash
cd /Users/jn/git/dragons-all
cp apps/cms/.env.example apps/cms/.env   # then fill DATABASE_URL_CMS + PAYLOAD_SECRET
docker compose -f apps/cms/docker-compose.yml up -d   # if the repo has one; otherwise use your existing dev postgres
```

A fresh `PAYLOAD_SECRET` invalidates stored API keys and sessions; password login survives. If `payload migrate:create` reports a collation-version mismatch on an older volume, run `ALTER DATABASE dragons_cms REFRESH COLLATION VERSION;`.

## File Structure

**`apps/cms` — schema (Part 1)**

| File | Responsibility |
| --- | --- |
| `src/collections/referees.ts` | **new** — the `referees` collection (was Strapi `schiedsrichter`) |
| `src/collections/teams.ts` | modify — add `leagueName`, `leagueId`; enable drafts |
| `src/collections/partners.ts` | modify — add `description`; enable drafts |
| `src/collections/shop-items.ts` | modify — `image` → `images` (hasMany), `price` → number; enable drafts |
| `src/collections/{downloads,projects,timeline-items,vorstand,positions}.ts` | modify — enable drafts |
| `src/payload.config.ts` | modify — register `Referees` |
| `src/collections/content-contract.test.ts` | modify — the field-name and drafts guard |
| `src/migrations/<generated>.ts` + `.json` | **generated** — one migration for all of Tasks 1–3 |
| `src/payload-types.ts` | **generated** — `payload generate:types` |

**`apps/cms` — rebuild suppression (Part 2)**

| File | Responsibility |
| --- | --- |
| `src/hooks/dispatch-rebuild.ts` | modify — honour `?skipRebuild=true` alongside `req.context.skipRebuild` |
| `src/hooks/dispatch-rebuild.test.ts` | modify — cover the query-parameter path |

**`apps/cms/scripts/migrate-strapi/` — the script (Part 3)**

| File | Responsibility |
| --- | --- |
| `strapi.ts` | Strapi v5 REST reader. Pagination, auth, `status` handling. All Strapi I/O. |
| `payload-client.ts` | Payload REST writer. Auth header, `?skipRebuild=true`, JSON + multipart create, bulk delete. All Payload I/O. |
| `convert-blocks.ts` | Strapi blocks JSON → HTML → Lexical. Pure except the `convertHTMLToLexical` call. |
| `mappers.ts` | Pure Strapi-doc → Payload-doc functions, one per collection. No I/O. |
| `media.ts` | Download from Strapi, upload to Payload, build the id map. |
| `index.ts` | Orchestration: wipe → ordered runs → count report. Nothing else. |
| `convert-blocks.test.ts`, `mappers.test.ts`, `strapi.test.ts` | tests |
| `fixtures/posts.json` | real Strapi post content pulled from the live API |

**`apps/site` (Part 4)**

| File | Responsibility |
| --- | --- |
| `src/lib/published.ts` | **new** — the `publishedOnly` predicate, the one tested seam for draft filtering |
| `src/lib/published.test.ts` | **new** — its tests |
| `src/content.config.ts` | modify — `_status` on 8 schemas; `shopItems.images`; `price` as number |
| `src/lib/format.ts` | modify — `formatPrice(number)` |
| `src/components/shop/ProductCard.astro` | modify — `images[0]` |
| 12 call sites | modify — apply `publishedOnly` |
| `src/components/kontakt/{VorstandGrid,PositionsGrid,RefereesGrid}.astro` | **new** — extracted sections |
| `src/components/page-blocks/ContactBlock.astro` | modify — delegate to the extracted grids |
| `src/pages/dragons/team/index.astro` | modify — render all four sections |

---

### Task 1: The `referees` collection

Was Strapi `schiedsrichter` (16 records, live on the legacy contact page). Mirrors `trainers` exactly, minus `email`. Created with drafts on from the start (D11) so it never needs a second migration.

**Files:**
- Create: `apps/cms/src/collections/referees.ts`
- Modify: `apps/cms/src/payload.config.ts:10-23` (import), `:51-66` (registration)
- Modify: `apps/cms/src/collections/content-contract.test.ts`
- Modify: `apps/cms/src/hooks/dispatch-rebuild.test.ts` (its collection list)

**Interfaces:**
- Produces: `Referees: CollectionConfig` with slug `referees` and fields `person` (relationship → `people`), `licence` (text), `image` (upload → `media`). Task 8's `mapReferee` writes exactly these names; Task 13 renders them.

- [ ] **Step 1: Write the failing contract test**

Add to `apps/cms/src/collections/content-contract.test.ts`. Put the import with the others, alphabetically (`import { Referees } from "./referees";` sits after `./posts`):

```ts
describe("referees", () => {
  it("has drafts on and publishedOrAuthed read access", () => {
    expect(Referees.versions).toEqual({ drafts: true });
    expect(Referees.access?.read).toBe(publishedOrAuthed);
  });

  it("carries the contracted fields", () => {
    expect(Referees.slug).toBe("referees");
    expect(fieldNames(Referees.fields)).toEqual(["person", "licence", "image"]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @dragons/cms test -- content-contract`
Expected: FAIL — `Cannot find module './referees'`.

- [ ] **Step 3: Create the collection**

```ts
// apps/cms/src/collections/referees.ts
import type { CollectionConfig } from "payload";

import { dispatchOnDelete, dispatchOnPublish } from "../hooks/dispatch-rebuild";
import { publishedOrAuthed } from "../lib/access";

// Was Strapi `schiedsrichter` — the club's referees, rendered on the contact
// page. Like trainers, no admin.useAsTitle: a referee has no own name field
// (the name lives on the related person) and useAsTitle cannot follow a
// relationship.
export const Referees: CollectionConfig = {
  slug: "referees",
  versions: { drafts: true },
  access: { read: publishedOrAuthed },
  fields: [
    { name: "person", type: "relationship", relationTo: "people" },
    { name: "licence", type: "text" }, // was Strapi schiedsrichter.lizenz
    { name: "image", type: "upload", relationTo: "media" },
  ],
  hooks: { afterChange: [dispatchOnPublish], afterDelete: [dispatchOnDelete] },
};
```

- [ ] **Step 4: Register it in the Payload config**

In `apps/cms/src/payload.config.ts`, add the import after the `Posts` import:

```ts
import { Referees } from "./collections/referees";
```

and add `Referees,` to the `collections` array, after `Trainers,`:

```ts
  collections: [
    Users,
    Media,
    Posts,
    Pages,
    Teams,
    People,
    Vorstand,
    Positions,
    Trainers,
    Referees,
    Partners,
    Projects,
    Downloads,
    ShopItems,
    TimelineItems,
  ],
```

- [ ] **Step 5: Add it to the dispatch-rebuild hook test's collection list**

`dispatch-rebuild.test.ts` asserts every content collection wires the hooks. Add `import { Referees } from "../collections/referees";` (alphabetically, after `./posts`) and add `Referees` to whichever array that test iterates — find it with:

Run: `grep -n "Trainers" apps/cms/src/hooks/dispatch-rebuild.test.ts`

Add `Referees` alongside every `Trainers` occurrence in a collection list.

- [ ] **Step 6: Run the full cms suite**

Run: `pnpm --filter @dragons/cms test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/cms/src/collections/referees.ts apps/cms/src/payload.config.ts \
        apps/cms/src/collections/content-contract.test.ts apps/cms/src/hooks/dispatch-rebuild.test.ts
git commit -m "feat(cms): referees collection"
```

---

### Task 2: Field additions so no Strapi field is lost

D2/D3. Five fields across three collections. `shopItems.image` becomes `images` (hasMany) and `price` becomes a number.

**Files:**
- Modify: `apps/cms/src/collections/teams.ts`, `partners.ts`, `shop-items.ts`
- Modify: `apps/cms/src/collections/content-contract.test.ts`

**Interfaces:**
- Produces: `teams.leagueName` (text), `teams.leagueId` (text), `partners.description` (textarea), `shopItems.images` (upload hasMany), `shopItems.price` (number). Task 8's mappers and Task 11/12's site schemas use exactly these names and types.

- [ ] **Step 1: Update the contract test to the new field lists**

In `content-contract.test.ts`, find the existing `teams`, `partners` and `shop-items` field-name assertions and change them to:

```ts
expect(fieldNames(Teams.fields)).toEqual([
  "name",
  "slug",
  "orderIndex",
  "teamImage",
  "apiTeamPermanentId",
  "leagueName",
  "leagueId",
  "trainers",
  "trainingTimes",
  ...SEO_FIELDS,
]);

expect(fieldNames(Partners.fields)).toEqual(["name", "description", "logo", "url", "orderIndex"]);

expect(fieldNames(ShopItems.fields)).toEqual([
  "name",
  "images",
  "price",
  "link",
  "description",
]);
```

Add a type assertion for the price change, since a rename is not the only risk here:

```ts
it("shop item price is a number, not text", () => {
  const price = ShopItems.fields.find((field) => "name" in field && field.name === "price");
  expect(price).toMatchObject({ type: "number" });
});

it("shop item images is a hasMany upload", () => {
  const images = ShopItems.fields.find((field) => "name" in field && field.name === "images");
  expect(images).toMatchObject({ type: "upload", relationTo: "media", hasMany: true });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @dragons/cms test -- content-contract`
Expected: FAIL — the arrays do not match; `price` is `text`.

- [ ] **Step 3: Add the team league fields**

In `apps/cms/src/collections/teams.ts`, insert after the `apiTeamPermanentId` field and before `trainers`:

```ts
    // Strapi team.leagueName / team.leagueId. Text, not number: leagueId
    // identifies the *league* on basketball-bund.net, not the team — it is not
    // interchangeable with apiTeamPermanentId above.
    { name: "leagueName", type: "text" },
    { name: "leagueId", type: "text" },
```

- [ ] **Step 4: Add the partner description**

In `apps/cms/src/collections/partners.ts`, insert after `name` and before `logo`:

```ts
    // Strapi partner.beschreibung — long prose the legacy supporter page shows.
    { name: "description", type: "textarea" },
```

- [ ] **Step 5: Change the shop item fields**

In `apps/cms/src/collections/shop-items.ts`, replace the `image` and `price` field entries:

```ts
    { name: "name", type: "text", required: true },
    // Strapi shop-item.images is an array; the site renders the first.
    { name: "images", type: "upload", relationTo: "media", hasMany: true },
    // Number, not text: Strapi stores 38.34 numerically and the site formats it.
    { name: "price", type: "number" },
    { name: "link", type: "text" },
    { name: "description", type: "textarea" },
```

- [ ] **Step 6: Run the full cms suite**

Run: `pnpm --filter @dragons/cms test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/cms/src/collections/
git commit -m "feat(cms): league, partner description and shop item fields"
```

---

### Task 3: Drafts on the eight existing collections

D9 + D11. `teams`, `downloads`, `shopItems`, `projects`, `timelineItems`, `vorstand`, `positions`, `partners`. **Not** `people`, `trainers` or `media` — a draft reached through a relation bypasses the site's filter (see the spec's "Why not every collection gets drafts").

**Files:**
- Modify: `apps/cms/src/collections/{teams,downloads,shop-items,projects,timeline-items,vorstand,positions,partners}.ts`
- Modify: `apps/cms/src/collections/content-contract.test.ts`

**Interfaces:**
- Produces: those eight collections carry `versions: { drafts: true }` and `access.read: publishedOrAuthed`, so their documents gain `_status`. Task 8's mappers set `_status` explicitly; Task 11 filters on it.

- [ ] **Step 1: Write the failing test**

Replace the existing `describe("drafted collections (posts, pages)")` block header and cases in `content-contract.test.ts` so the list covers everything drafted, and add an explicit negative case — the negative is the one that catches a well-meaning future change:

```ts
describe("drafted collections", () => {
  it.each([
    { slug: "posts", collection: Posts },
    { slug: "pages", collection: Pages },
    { slug: "teams", collection: Teams },
    { slug: "downloads", collection: Downloads },
    { slug: "shop-items", collection: ShopItems },
    { slug: "projects", collection: Projects },
    { slug: "timeline-items", collection: TimelineItems },
    { slug: "vorstand", collection: Vorstand },
    { slug: "positions", collection: Positions },
    { slug: "partners", collection: Partners },
    { slug: "referees", collection: Referees },
  ])("$slug has drafts on and publishedOrAuthed read access", ({ collection }) => {
    expect(collection.versions).toEqual({ drafts: true });
    expect(collection.access?.read).toBe(publishedOrAuthed);
  });

  // people, trainers and media are reached through relations from published
  // parents (people → vorstand/positions/trainers at depth 2, trainers → teams
  // at depth 3, media → everything). The site filters _status only on the
  // collection it loads, and the build user's API key sees drafts, so a draft
  // here would render live. Drafting them needs relation-level filtering first.
  it.each([
    { slug: "people", collection: People },
    { slug: "trainers", collection: Trainers },
    { slug: "media", collection: Media },
  ])("$slug deliberately has no drafts", ({ collection }) => {
    expect(collection.versions).toBeUndefined();
    expect(collection.access?.read).toBe(anyone);
  });
});
```

`Media` and `Referees` need importing into this test file if they are not already there.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @dragons/cms test -- content-contract`
Expected: FAIL — `expected undefined to deeply equal { drafts: true }` for teams and the rest.

- [ ] **Step 3: Enable drafts on each of the eight**

For **each** of `teams.ts`, `downloads.ts`, `shop-items.ts`, `projects.ts`, `timeline-items.ts`, `vorstand.ts`, `positions.ts`, `partners.ts`:

1. Change the access import from `anyone` to `publishedOrAuthed`:
   ```ts
   import { publishedOrAuthed } from "../lib/access";
   ```
2. Add `versions` and change `access`, so the top of the config reads:
   ```ts
   export const Teams: CollectionConfig = {
     slug: "teams",
     versions: { drafts: true },
     access: { read: publishedOrAuthed },
     admin: { useAsTitle: "name" },
   ```

Keep each file's existing `admin` block and comments. `trainers.ts`, `people.ts` and `media.ts` are **not** touched.

- [ ] **Step 4: Run the full cms suite**

Run: `pnpm --filter @dragons/cms test`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @dragons/cms typecheck`
Expected: no errors. If `anyone` is now unused in a file, remove its import.

- [ ] **Step 6: Commit**

```bash
git add apps/cms/src/collections/
git commit -m "feat(cms): drafts on the collections nothing relates to"
```

---

### Task 4: Generate the DB migration and types

One migration covering Tasks 1–3. Production runs committed migrations at boot via `src/instrumentation.ts`, so this must exist before anything deploys.

**Files:**
- Create: `apps/cms/src/migrations/<timestamp>_<name>.ts` and `.json` (generated)
- Modify: `apps/cms/src/migrations/index.ts` (generated)
- Modify: `apps/cms/src/payload-types.ts` (generated)

**Interfaces:**
- Consumes: the schema from Tasks 1–3.
- Produces: `Referee`, updated `Team`, `Partner`, `ShopItem` types in `payload-types.ts`, plus `_status` on the eight newly drafted collections.

- [ ] **Step 1: Make sure the local Postgres is up and `.env` is filled**

Run: `pnpm --filter @dragons/cms exec payload migrate:status`
Expected: it connects and lists `20260802_122438_initial` as applied. If it cannot connect, fix `DATABASE_URL_CMS` before continuing — a migration generated against the wrong schema is worse than none.

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @dragons/cms exec payload migrate:create strapi_migration_schema`
Expected: a new pair of files in `src/migrations/` and an updated `index.ts`.

- [ ] **Step 3: Read the generated SQL before trusting it**

Open the generated `.ts`. Confirm it contains, at minimum: a `referees` table; `league_name` and `league_id` on `teams`; `description` on `partners`; a `shop_items_rels`-style change or `images` join for the hasMany upload; `price` altered to a numeric type; and `_status` columns plus `_v` version tables for the eight drafted collections.

If `price` is dropped and recreated rather than cast, that is fine — the collections are empty in production.

- [ ] **Step 4: Regenerate types**

Run: `pnpm --filter @dragons/cms exec payload generate:types`
Expected: `src/payload-types.ts` gains a `Referee` interface and `_status` fields.

- [ ] **Step 5: Verify the migration applies cleanly from scratch**

Run: `pnpm --filter @dragons/cms exec payload migrate`
Expected: `Migrated: <timestamp>_strapi_migration_schema`, no errors.

- [ ] **Step 6: Run the full suite and typecheck**

Run: `pnpm --filter @dragons/cms test && pnpm --filter @dragons/cms typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/cms/src/migrations/ apps/cms/src/payload-types.ts
git commit -m "feat(cms): migration for the strapi import schema"
```

---

### Task 5: Honour `?skipRebuild=true` over REST

Payload's `createPayloadRequest` hard-sets `context: {}`, so the existing `req.context?.skipRebuild` guard is unreachable from a REST client. Without this, the migration's ~130 writes each fire a `repository_dispatch`. This is the pattern Payload uses in its own `test/hooks/collections/ContextHooks` fixture, narrowed to one known flag.

**Files:**
- Modify: `apps/cms/src/hooks/dispatch-rebuild.ts`
- Modify: `apps/cms/src/hooks/dispatch-rebuild.test.ts`

**Interfaces:**
- Produces: `shouldSkipRebuild(req): boolean`, exported so it is directly testable. All three hooks use it. Task 6's `payload-client.ts` appends `skipRebuild=true` to every write URL.

- [ ] **Step 1: Write the failing tests**

`dispatch-rebuild.test.ts` already has a `changeArgs({ skipRebuild })` helper that sets `req.context`. Add a second axis. Extend the helper and add cases:

```ts
function changeArgs({
  status,
  previousStatus,
  skipRebuild = false,
  skipRebuildParam = false,
}: {
  status?: string;
  previousStatus?: string;
  skipRebuild?: boolean;
  skipRebuildParam?: boolean;
} = {}) {
  return {
    doc: { id: 1, _status: status },
    previousDoc: { id: 1, _status: previousStatus },
    req: {
      context: skipRebuild ? { skipRebuild: true } : {},
      searchParams: new URLSearchParams(skipRebuildParam ? { skipRebuild: "true" } : {}),
    },
    collection: { slug: "posts" },
  } as unknown as ChangeArgs;
}
```

Then the new cases:

```ts
it("does not dispatch when the request carries ?skipRebuild=true", async () => {
  await dispatchOnPublish(changeArgs({ status: "published", skipRebuildParam: true }));
  expect(fetchMock).not.toHaveBeenCalled();
});

it("still dispatches when the parameter is absent", async () => {
  await dispatchOnPublish(changeArgs({ status: "published" }));
  expect(fetchMock).toHaveBeenCalledOnce();
});

it("ignores a skipRebuild parameter that is not exactly \"true\"", async () => {
  await dispatchOnPublish(
    changeArgs({ status: "published", skipRebuildParam: false }),
  );
  expect(fetchMock).toHaveBeenCalledOnce();
});

it("tolerates a request with no searchParams at all", async () => {
  const args = { ...changeArgs({ status: "published" }) } as ChangeArgs;
  (args.req as unknown as { searchParams?: URLSearchParams }).searchParams = undefined;
  await dispatchOnPublish(args);
  expect(fetchMock).toHaveBeenCalledOnce();
});
```

Add the equivalent parameter case for `dispatchOnDelete` and `dispatchGlobalOnChange` using their existing arg helpers.

- [ ] **Step 2: Run and watch them fail**

Run: `pnpm --filter @dragons/cms test -- dispatch-rebuild`
Expected: FAIL — the `?skipRebuild=true` cases dispatch anyway.

- [ ] **Step 3: Implement the shared guard**

In `apps/cms/src/hooks/dispatch-rebuild.ts`, add above `dispatchOnPublish`:

```ts
/**
 * The migration script (issue #165) writes over REST, and Payload's REST layer
 * hard-sets `req.context` to `{}` — `createPayloadRequest` offers no way to
 * pass context in. So a bulk import cannot reach the `context.skipRebuild`
 * guard below and would fire one repository_dispatch per document.
 *
 * `?skipRebuild=true` is the documented workaround (Payload's own
 * test/hooks/collections/ContextHooks fixture lifts query params into context;
 * this is the same idea narrowed to one known flag). Writes require
 * authentication, so only editors and the build user can set it, and the daily
 * deploy cron remains the safety net.
 */
function shouldSkipRebuild(req: { context?: { skipRebuild?: unknown }; searchParams?: URLSearchParams }): boolean {
  if (req.context?.skipRebuild) return true;
  return req.searchParams?.get("skipRebuild") === "true";
}
```

Then replace the three guards:

```ts
export const dispatchOnPublish: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
  collection,
}) => {
  if (shouldSkipRebuild(req)) return doc;
  // …unchanged…
};

export const dispatchOnDelete: CollectionAfterDeleteHook = async ({ doc, req, collection }) => {
  if (!shouldSkipRebuild(req)) await dispatch(`${collection.slug} delete`);
  return doc;
};

export const dispatchGlobalOnChange: GlobalAfterChangeHook = async ({ doc, req, global }) => {
  if (!shouldSkipRebuild(req)) await dispatch(`${global.slug} change`);
  return doc;
};
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @dragons/cms test -- dispatch-rebuild`
Expected: PASS.

- [ ] **Step 5: Check coverage did not regress**

Run: `pnpm --filter @dragons/cms coverage`
Expected: PASS, at or above 91/100/98/98. If branches dipped, the untested branch is `req.searchParams?` being undefined — the fourth test above covers it.

- [ ] **Step 6: Commit**

```bash
git add apps/cms/src/hooks/
git commit -m "feat(cms): let REST writes suppress the rebuild dispatch"
```

---

### Task 6: Script scaffolding, Strapi reader and Payload writer

The two I/O modules. Everything else in Part 3 is pure and testable without a network.

**Files:**
- Create: `apps/cms/scripts/migrate-strapi/strapi.ts`, `payload-client.ts`, `strapi.test.ts`
- Modify: `apps/cms/package.json` (add `tsx`, add the `migrate:strapi` script)
- Modify: `apps/cms/vitest.config.ts` (include `scripts/**/*.test.ts`)
- Modify: `knip.json` (`apps/cms` project + entry so `tsx` is not flagged unused)

**Interfaces:**
- Produces:
  - `interface StrapiDoc { id: number; documentId: string; publishedAt: string | null; [key: string]: unknown }`
  - `fetchAll(type: string, params?: Record<string, string>): Promise<StrapiDoc[]>` — paginates until exhausted
  - `fetchSingle(type: string): Promise<StrapiDoc | null>` — for the two singletons
  - `fetchUploads(): Promise<StrapiFile[]>` where `StrapiFile = { id: number; name: string; url: string; mime: string; size: number; alternativeText: string | null }`
  - `downloadFile(url: string): Promise<Blob>`
  - `createDoc(collection: string, data: unknown): Promise<{ id: number }>`
  - `createUpload(collection: string, file: Blob, filename: string, data: unknown): Promise<{ id: number }>`
  - `updateGlobal(slug: string, data: unknown): Promise<void>`
  - `deleteAll(collection: string): Promise<number>`
  - `countDocs(collection: string): Promise<number>`

- [ ] **Step 1: Add tsx and the run script**

In `apps/cms/package.json`, add to `devDependencies`:

```json
    "tsx": "^4.21.0",
```

and to `scripts`:

```json
    "migrate:strapi": "tsx scripts/migrate-strapi/index.ts",
```

Run: `pnpm install`

- [ ] **Step 2: Make vitest see the scripts directory**

In `apps/cms/vitest.config.ts`, change the `include` line:

```ts
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
```

Leave `coverage.include` as `["src/**/*.ts"]`. The script is one-off code that never ships in the Docker image; holding it to the app's 98% line floor would mean testing `fetch` wrappers for no signal. Its pure logic (Tasks 7 and 8) is tested directly regardless.

- [ ] **Step 3: Stop knip flagging tsx and the script**

In `knip.json`, replace the `apps/cms` workspace block with:

```json
    "apps/cms": {
      "entry": [
        "scripts/migrate-strapi/index.ts"
      ],
      "project": [
        "src/**/*.{ts,tsx}",
        "scripts/**/*.ts"
      ]
    },
```

Run: `pnpm knip`
Expected: no new findings.

- [ ] **Step 4: Write the failing Strapi client test**

```ts
// apps/cms/scripts/migrate-strapi/strapi.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildStrapiUrl, mergePages } from "./strapi";

describe("buildStrapiUrl", () => {
  it("asks for published documents by default and a full page", () => {
    const url = buildStrapiUrl("https://cms.example.de", "posts", 1, {});
    expect(url).toBe(
      "https://cms.example.de/api/posts?pagination%5Bpage%5D=1&pagination%5BpageSize%5D=100&populate=%2A&status=published",
    );
  });

  it("strips a trailing slash from the base so the path is not doubled", () => {
    const url = buildStrapiUrl("https://cms.example.de/", "teams", 2, {});
    expect(url).toContain("https://cms.example.de/api/teams?");
    expect(url).not.toContain("//api");
  });

  it("lets a caller override status to read drafts", () => {
    const url = buildStrapiUrl("https://cms.example.de", "partners", 1, { status: "draft" });
    expect(url).toContain("status=draft");
  });
});

describe("mergePages", () => {
  it("concatenates pages in order", () => {
    expect(mergePages([[{ id: 1 }], [{ id: 2 }, { id: 3 }]])).toEqual([
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ]);
  });
});
```

- [ ] **Step 5: Run it and watch it fail**

Run: `pnpm --filter @dragons/cms test -- strapi`
Expected: FAIL — `Cannot find module './strapi'`.

- [ ] **Step 6: Implement the Strapi client**

```ts
// apps/cms/scripts/migrate-strapi/strapi.ts

/** A Strapi 5 document. Flat — v5 dropped v4's `attributes` wrapper. */
export interface StrapiDoc {
  id: number;
  documentId: string;
  publishedAt: string | null;
  [key: string]: unknown;
}

export interface StrapiFile {
  id: number;
  name: string;
  url: string;
  mime: string;
  size: number;
  alternativeText: string | null;
}

const PAGE_SIZE = 100;

/** Exported for tests: the exact query Strapi 5 needs. */
export function buildStrapiUrl(
  base: string,
  type: string,
  page: number,
  overrides: Record<string, string>,
): string {
  const url = new URL(`${base.replace(/\/$/, "")}/api/${type}`);
  const params = new URLSearchParams({
    "pagination[page]": String(page),
    "pagination[pageSize]": String(PAGE_SIZE),
    populate: "*",
    // Strapi 5 replaced v4's publicationState=preview with status.
    status: "published",
    // No `locale` parameter on purpose: Strapi returns the default locale (de),
    // and the en translations are deliberately not migrated (spec D5) because
    // Payload has no localization configured. The English text stays in Strapi.
    ...overrides,
  });
  params.sort();
  url.search = params.toString();
  return url.toString();
}

export function mergePages<T>(pages: T[][]): T[] {
  return pages.flat();
}

function env(name: "STRAPI_URL" | "STRAPI_TOKEN"): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`${name} is not set`);
  return value;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${env("STRAPI_TOKEN")}` } });
  if (!res.ok) throw new Error(`strapi: HTTP ${res.status} for ${url}`);
  return res.json();
}

export async function fetchAll(
  type: string,
  overrides: Record<string, string> = {},
): Promise<StrapiDoc[]> {
  const pages: StrapiDoc[][] = [];
  for (let page = 1; ; page += 1) {
    const body = (await getJson(buildStrapiUrl(env("STRAPI_URL"), type, page, overrides))) as {
      data: StrapiDoc[];
      meta: { pagination: { pageCount: number } };
    };
    pages.push(body.data);
    if (page >= body.meta.pagination.pageCount) break;
  }
  return mergePages(pages);
}

export async function fetchSingle(type: string): Promise<StrapiDoc | null> {
  const url = new URL(`${env("STRAPI_URL").replace(/\/$/, "")}/api/${type}`);
  url.searchParams.set("populate", "*");
  const body = (await getJson(url.toString())) as { data: StrapiDoc | null };
  return body.data;
}

export async function fetchUploads(): Promise<StrapiFile[]> {
  const url = `${env("STRAPI_URL").replace(/\/$/, "")}/api/upload/files`;
  const body = (await getJson(url)) as StrapiFile[] | { results: StrapiFile[] };
  return Array.isArray(body) ? body : body.results;
}

export async function downloadFile(fileUrl: string): Promise<Blob> {
  const absolute = fileUrl.startsWith("http")
    ? fileUrl
    : `${env("STRAPI_URL").replace(/\/$/, "")}${fileUrl}`;
  const res = await fetch(absolute, {
    headers: { Authorization: `Bearer ${env("STRAPI_TOKEN")}` },
  });
  if (!res.ok) throw new Error(`strapi download: HTTP ${res.status} for ${absolute}`);
  return res.blob();
}
```

- [ ] **Step 7: Run the tests**

Run: `pnpm --filter @dragons/cms test -- strapi`
Expected: PASS.

- [ ] **Step 8: Implement the Payload writer**

```ts
// apps/cms/scripts/migrate-strapi/payload-client.ts

function env(name: "CMS_URL" | "CMS_API_TOKEN"): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`${name} is not set`);
  return value;
}

function headers(): Record<string, string> {
  return { Authorization: `users API-Key ${env("CMS_API_TOKEN")}` };
}

/**
 * Every write carries ?skipRebuild=true so the afterChange/afterDelete hooks
 * do not fire ~130 repository_dispatch events at dragons-hub. REST cannot set
 * req.context, which is why the hook reads this query parameter — see
 * apps/cms/src/hooks/dispatch-rebuild.ts.
 */
function writeUrl(path: string, extra: Record<string, string> = {}): string {
  const url = new URL(`${env("CMS_URL").replace(/\/$/, "")}${path}`);
  url.searchParams.set("skipRebuild", "true");
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
  return url.toString();
}

async function expectOk(res: Response, what: string): Promise<unknown> {
  if (!res.ok) throw new Error(`payload ${what}: HTTP ${res.status} — ${await res.text()}`);
  return res.json();
}

export async function createDoc(collection: string, data: unknown): Promise<{ id: number }> {
  const res = await fetch(writeUrl(`/api/${collection}`), {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = (await expectOk(res, `create ${collection}`)) as { doc: { id: number } };
  return body.doc;
}

export async function createUpload(
  collection: string,
  file: Blob,
  filename: string,
  data: unknown,
): Promise<{ id: number }> {
  const form = new FormData();
  form.append("file", file, filename);
  form.append("_payload", JSON.stringify(data));
  // No Content-Type header — fetch sets the multipart boundary itself.
  const res = await fetch(writeUrl(`/api/${collection}`), {
    method: "POST",
    headers: headers(),
    body: form,
  });
  const body = (await expectOk(res, `upload ${filename}`)) as { doc: { id: number } };
  return body.doc;
}

export async function updateGlobal(slug: string, data: unknown): Promise<void> {
  const res = await fetch(writeUrl(`/api/globals/${slug}`), {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  await expectOk(res, `global ${slug}`);
}

export async function deleteAll(collection: string): Promise<number> {
  // `where[id][exists]=true` matches every document; Payload requires a where.
  const res = await fetch(writeUrl(`/api/${collection}`, { "where[id][exists]": "true" }), {
    method: "DELETE",
    headers: headers(),
  });
  const body = (await expectOk(res, `delete ${collection}`)) as { docs: unknown[] };
  return body.docs.length;
}

export async function countDocs(collection: string): Promise<number> {
  const url = new URL(`${env("CMS_URL").replace(/\/$/, "")}/api/${collection}`);
  url.searchParams.set("limit", "0");
  url.searchParams.set("depth", "0");
  const res = await fetch(url.toString(), { headers: headers() });
  const body = (await expectOk(res, `count ${collection}`)) as { totalDocs: number };
  return body.totalDocs;
}
```

- [ ] **Step 9: Typecheck and commit**

Run: `pnpm --filter @dragons/cms typecheck && pnpm --filter @dragons/cms test`
Expected: PASS.

```bash
git add apps/cms/scripts/ apps/cms/package.json apps/cms/vitest.config.ts knip.json pnpm-lock.yaml
git commit -m "feat(cms): strapi reader and payload writer for the migration"
```

---

### Task 7: Strapi blocks → Lexical converter

The plan's "known-worst chunk", measured small: across all four posts there are 21 paragraphs, 1 heading, 2 links and 1 bold mark — no lists, images, quotes or code. Implemented defensively anyway, because an editor could add one before the freeze.

**Files:**
- Create: `apps/cms/scripts/migrate-strapi/convert-blocks.ts`, `convert-blocks.test.ts`, `fixtures/posts.json`
- Modify: `apps/cms/package.json` (add `jsdom`)

**Interfaces:**
- Consumes: `mediaMap: Map<number, number>` from Task 9.
- Produces:
  - `strapiBlocksToHtml(blocks: StrapiBlock[], mediaMap: Map<number, number>): string`
  - `strapiBlocksToLexical(blocks: StrapiBlock[], mediaMap: Map<number, number>): Promise<unknown>` — the value Task 8 puts in `posts.content`.

- [ ] **Step 1: Capture real fixtures from the live Strapi**

```bash
export STRAPI_TOKEN=$(cat /private/tmp/claude-501/-Users-jn-git-dragons-cms/c447e72f-f5ba-49c9-864a-fee562527ad8/scratchpad/.strapi_token)
curl -s -H "Authorization: Bearer $STRAPI_TOKEN" \
  'https://cms.hbdragons.de/api/posts?populate=*' \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); json.dump([{"slug":p.get("slug"),"content":p.get("content")} for p in d["data"]], open("apps/cms/scripts/migrate-strapi/fixtures/posts.json","w"), ensure_ascii=False, indent=2)'
```

Create the `fixtures/` directory first. Fixtures are club content, not secrets — committing them is intended.

- [ ] **Step 2: Add jsdom**

In `apps/cms/package.json` `devDependencies`:

```json
    "jsdom": "^26.1.0",
```

Run: `pnpm install`

- [ ] **Step 3: Write the failing tests**

```ts
// apps/cms/scripts/migrate-strapi/convert-blocks.test.ts
import { describe, expect, it } from "vitest";

import fixtures from "./fixtures/posts.json" with { type: "json" };
import { strapiBlocksToHtml, strapiBlocksToLexical, type StrapiBlock } from "./convert-blocks";

const NO_MEDIA = new Map<number, number>();

describe("strapiBlocksToHtml", () => {
  it("renders a paragraph", () => {
    const blocks = [
      { type: "paragraph", children: [{ type: "text", text: "Hallo" }] },
    ] as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, NO_MEDIA)).toBe("<p>Hallo</p>");
  });

  it("keeps an empty paragraph, because it is the author's spacing", () => {
    const blocks = [{ type: "paragraph", children: [{ type: "text", text: "" }] }] as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, NO_MEDIA)).toBe("<p></p>");
  });

  it("renders a heading at its level", () => {
    const blocks = [
      { type: "heading", level: 2, children: [{ type: "text", text: "Titel" }] },
    ] as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, NO_MEDIA)).toBe("<h2>Titel</h2>");
  });

  it("renders marks", () => {
    const blocks = [
      {
        type: "paragraph",
        children: [
          { type: "text", text: "a", bold: true },
          { type: "text", text: "b", italic: true },
          { type: "text", text: "c", underline: true },
          { type: "text", text: "d", strikethrough: true },
          { type: "text", text: "e", code: true },
        ],
      },
    ] as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, NO_MEDIA)).toBe(
      "<p><strong>a</strong><em>b</em><u>c</u><s>d</s><code>e</code></p>",
    );
  });

  it("renders a link", () => {
    const blocks = [
      {
        type: "paragraph",
        children: [
          {
            type: "link",
            url: "https://hbdragons.de",
            children: [{ type: "text", text: "Dragons" }],
          },
        ],
      },
    ] as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, NO_MEDIA)).toBe(
      '<p><a href="https://hbdragons.de">Dragons</a></p>',
    );
  });

  it("renders both list kinds", () => {
    const blocks = [
      {
        type: "list",
        format: "unordered",
        children: [{ type: "list-item", children: [{ type: "text", text: "eins" }] }],
      },
      {
        type: "list",
        format: "ordered",
        children: [{ type: "list-item", children: [{ type: "text", text: "zwei" }] }],
      },
    ] as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, NO_MEDIA)).toBe(
      "<ul><li>eins</li></ul><ol><li>zwei</li></ol>",
    );
  });

  it("renders quote and code", () => {
    const blocks = [
      { type: "quote", children: [{ type: "text", text: "zitat" }] },
      { type: "code", children: [{ type: "text", text: "x = 1" }] },
    ] as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, NO_MEDIA)).toBe(
      "<blockquote>zitat</blockquote><pre><code>x = 1</code></pre>",
    );
  });

  it("maps an image to its migrated media id", () => {
    const blocks = [
      { type: "image", image: { id: 7, alternativeText: "Banner" }, children: [] },
    ] as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, new Map([[7, 42]]))).toBe(
      '<img data-media-id="42" alt="Banner" />',
    );
  });

  it("drops an image whose file was not migrated", () => {
    const blocks = [
      { type: "image", image: { id: 7, alternativeText: null }, children: [] },
    ] as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, NO_MEDIA)).toBe("");
  });

  it("escapes HTML so editor text cannot inject markup", () => {
    const blocks = [
      { type: "paragraph", children: [{ type: "text", text: "a < b & \"c\"" }] },
    ] as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, NO_MEDIA)).toBe("<p>a &lt; b &amp; &quot;c&quot;</p>");
  });

  it("falls back to a paragraph for an unknown node type", () => {
    const blocks = [
      { type: "mystery", children: [{ type: "text", text: "trotzdem" }] },
    ] as unknown as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, NO_MEDIA)).toBe("<p>trotzdem</p>");
  });
});

describe("real post fixtures", () => {
  it.each(fixtures.map((post) => [post.slug ?? "(no slug)", post] as const))(
    "%s survives conversion to Lexical with a root",
    async (_slug, post) => {
      const lexical = (await strapiBlocksToLexical(
        (post.content ?? []) as StrapiBlock[],
        NO_MEDIA,
      )) as { root: { children: unknown[] } };
      expect(lexical.root).toBeDefined();
      expect(Array.isArray(lexical.root.children)).toBe(true);
    },
  );

  it("keeps the heading and both links from the real corpus", () => {
    const html = fixtures
      .map((post) => strapiBlocksToHtml((post.content ?? []) as StrapiBlock[], NO_MEDIA))
      .join("");
    expect(html).toContain("<h");
    expect(html.match(/<a href=/g)).toHaveLength(2);
    expect(html).toContain("<strong>");
  });
});
```

- [ ] **Step 4: Run and watch them fail**

Run: `pnpm --filter @dragons/cms test -- convert-blocks`
Expected: FAIL — `Cannot find module './convert-blocks'`.

- [ ] **Step 5: Implement the converter**

```ts
// apps/cms/scripts/migrate-strapi/convert-blocks.ts
import { convertHTMLToLexical } from "@payloadcms/richtext-lexical";
import { JSDOM } from "jsdom";

export interface StrapiBlock {
  type: string;
  level?: number;
  format?: "ordered" | "unordered";
  url?: string;
  text?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  code?: boolean;
  image?: { id: number; alternativeText: string | null };
  children?: StrapiBlock[];
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

/** Text marks nest outward-in, matching how Strapi stores them on the leaf. */
function renderText(node: StrapiBlock): string {
  let html = escapeHtml(node.text ?? "");
  if (node.code === true) html = `<code>${html}</code>`;
  if (node.strikethrough === true) html = `<s>${html}</s>`;
  if (node.underline === true) html = `<u>${html}</u>`;
  if (node.italic === true) html = `<em>${html}</em>`;
  if (node.bold === true) html = `<strong>${html}</strong>`;
  return html;
}

function renderChildren(nodes: StrapiBlock[] | undefined, mediaMap: Map<number, number>): string {
  return (nodes ?? []).map((node) => renderNode(node, mediaMap)).join("");
}

function renderNode(node: StrapiBlock, mediaMap: Map<number, number>): string {
  switch (node.type) {
    case "text":
      return renderText(node);
    case "paragraph":
      return `<p>${renderChildren(node.children, mediaMap)}</p>`;
    case "heading": {
      // Strapi allows 1-6; clamp so a bad value cannot emit <h9>.
      const level = Math.min(Math.max(node.level ?? 2, 1), 6);
      return `<h${level}>${renderChildren(node.children, mediaMap)}</h${level}>`;
    }
    case "link":
      return `<a href="${escapeHtml(node.url ?? "")}">${renderChildren(node.children, mediaMap)}</a>`;
    case "list": {
      const tag = node.format === "ordered" ? "ol" : "ul";
      return `<${tag}>${renderChildren(node.children, mediaMap)}</${tag}>`;
    }
    case "list-item":
      return `<li>${renderChildren(node.children, mediaMap)}</li>`;
    case "quote":
      return `<blockquote>${renderChildren(node.children, mediaMap)}</blockquote>`;
    case "code":
      return `<pre><code>${renderChildren(node.children, mediaMap)}</code></pre>`;
    case "image": {
      const payloadId = node.image === undefined ? undefined : mediaMap.get(node.image.id);
      // A dangling image is dropped rather than emitted broken; index.ts logs it.
      if (payloadId === undefined) return "";
      return `<img data-media-id="${payloadId}" alt="${escapeHtml(node.image?.alternativeText ?? "")}" />`;
    }
    default:
      // Nothing in the real corpus hits this. Keep the text rather than lose it.
      console.warn(`convert-blocks: unknown node type "${node.type}" — wrapped in a paragraph`);
      return `<p>${renderChildren(node.children, mediaMap)}</p>`;
  }
}

export function strapiBlocksToHtml(
  blocks: StrapiBlock[],
  mediaMap: Map<number, number>,
): string {
  return blocks.map((block) => renderNode(block, mediaMap)).join("");
}

export async function strapiBlocksToLexical(
  blocks: StrapiBlock[],
  mediaMap: Map<number, number>,
): Promise<unknown> {
  const html = strapiBlocksToHtml(blocks, mediaMap);
  return convertHTMLToLexical({ html, JSDOM });
}
```

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter @dragons/cms test -- convert-blocks`
Expected: PASS. If `convertHTMLToLexical` has a different export path in 3.87.0, resolve it with:
`grep -r "convertHTMLToLexical" node_modules/@payloadcms/richtext-lexical/dist/index.d.ts`

- [ ] **Step 7: Commit**

```bash
git add apps/cms/scripts/migrate-strapi/ apps/cms/package.json pnpm-lock.yaml
git commit -m "feat(cms): strapi blocks to lexical converter"
```

---

### Task 8: Pure mappers

One function per collection, no I/O. This is where the whole field contract becomes testable.

**Files:**
- Create: `apps/cms/scripts/migrate-strapi/mappers.ts`, `mappers.test.ts`

**Interfaces:**
- Consumes: `StrapiDoc` from Task 6, `mediaMap`/id maps built by Task 10.
- Produces: `mapPerson`, `mapPosition`, `mapVorstand`, `mapTrainer`, `mapReferee`, `mapTeam`, `mapPartner`, `mapProject`, `mapDownload`, `mapShopItem`, `mapTimelineItem`, `mapPage`, `mapPost`, plus `slugify`, `publishedStatus`, `TEAM_PERMANENT_IDS`, `PAGE_SLUGS`, `SEEDED_PAGES`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/cms/scripts/migrate-strapi/mappers.test.ts
import { describe, expect, it } from "vitest";

import {
  PAGE_SLUGS,
  SEEDED_PAGES,
  mapDownload,
  mapPage,
  mapPartner,
  mapPost,
  mapShopItem,
  mapTeam,
  mapTimelineItem,
  publishedStatus,
  slugify,
} from "./mappers";

const ids = { media: new Map<number, number>(), trainers: new Map<number, number>() };

describe("slugify", () => {
  it("lowercases, strips punctuation and joins on hyphens", () => {
    expect(slugify("Caritas Spendenspieltag")).toBe("caritas-spendenspieltag");
  });

  it("transliterates German umlauts rather than dropping them", () => {
    expect(slugify("Beiträge für Grüße")).toBe("beitraege-fuer-gruesse");
  });
});

describe("publishedStatus", () => {
  it("is published when Strapi has a publishedAt", () => {
    expect(publishedStatus({ publishedAt: "2025-08-11T20:58:56.822Z" })).toBe("published");
  });

  it("is draft when Strapi never published it", () => {
    expect(publishedStatus({ publishedAt: null })).toBe("draft");
  });
});

describe("mapTeam", () => {
  it("carries league fields and joins the permanent id by slug", () => {
    const doc = {
      id: 107,
      documentId: "x",
      publishedAt: "2025-01-01T00:00:00.000Z",
      name: "Damen 1",
      slug: "damen-1",
      orderIndex: 1,
      leagueName: "2. Regionalliga Damen West",
      leagueId: "48668",
      teamImage: { id: 3 },
      trainer: [{ id: 8 }],
      training: [
        { day: "Montag", startTime: "20:00", endTime: "22:00", gym: "IGS Linden", info: null },
      ],
    };
    const mapped = mapTeam(doc, {
      media: new Map([[3, 300]]),
      trainers: new Map([[8, 800]]),
    });
    expect(mapped).toMatchObject({
      name: "Damen 1",
      slug: "damen-1",
      orderIndex: 1,
      leagueName: "2. Regionalliga Damen West",
      leagueId: "48668",
      teamImage: 300,
      trainers: [800],
      // The literal, not TEAM_PERMANENT_IDS["damen-1"] — asserting against the
      // table would pass even if the table were wrong.
      apiTeamPermanentId: 320674,
      _status: "published",
    });
    expect(mapped.trainingTimes).toEqual([
      {
        day: "Montag",
        startTime: "20:00",
        endTime: "22:00",
        gym: "IGS Linden",
        gymMapsUrl: null,
        info: null,
      },
    ]);
  });

  it("leaves teamImage null when the team has no image", () => {
    const doc = {
      id: 108,
      documentId: "y",
      publishedAt: "2025-01-01T00:00:00.000Z",
      name: "Damen 2",
      slug: "damen-2",
      orderIndex: 2,
      teamImage: null,
      trainer: [],
      training: null,
    };
    expect(mapTeam(doc, ids).teamImage).toBeNull();
    expect(mapTeam(doc, ids).trainingTimes).toEqual([]);
  });
});

describe("mapPartner", () => {
  it("renames beschreibung to description and link to url", () => {
    expect(
      mapPartner(
        {
          id: 16,
          documentId: "z",
          publishedAt: "2025-01-01T00:00:00.000Z",
          name: "Menbun",
          beschreibung: "Lange Prosa",
          link: "https://menbun.de",
          logo: { id: 5 },
        },
        { media: new Map([[5, 500]]) },
        0,
      ),
    ).toMatchObject({
      name: "Menbun",
      description: "Lange Prosa",
      url: "https://menbun.de",
      logo: 500,
      orderIndex: 0,
      _status: "published",
    });
  });

  it("maps the unpublished partner to a draft", () => {
    expect(
      mapPartner(
        { id: 13, documentId: "w", publishedAt: null, name: "SportCheck", logo: null },
        ids,
        1,
      )._status,
    ).toBe("draft");
  });
});

describe("mapShopItem", () => {
  it("keeps every image and passes the price through as a number", () => {
    expect(
      mapShopItem(
        {
          id: 31,
          documentId: "s",
          publishedAt: "2025-01-01T00:00:00.000Z",
          name: "Sweater",
          price: 38.34,
          link: "https://shop.example",
          description: "Text",
          images: [{ id: 1 }, { id: 2 }],
        },
        { media: new Map([[1, 10], [2, 20]]) },
      ),
    ).toMatchObject({ name: "Sweater", price: 38.34, images: [10, 20] });
  });
});

describe("mapDownload", () => {
  it("backfills createdAt from Strapi publishedAt, because the site sorts on it", () => {
    expect(
      mapDownload(
        {
          id: 10,
          documentId: "d",
          publishedAt: "2025-08-12T17:29:55.959Z",
          name: "Beitragssätze",
          file: { id: 34 },
        },
        { media: new Map([[34, 340]]) },
      ),
    ).toMatchObject({
      title: "Beitragssätze",
      file: 340,
      createdAt: "2025-08-12T17:29:55.959Z",
      category: null,
    });
  });
});

describe("mapTimelineItem", () => {
  it("takes the four-digit year from the Strapi date", () => {
    expect(
      mapTimelineItem(
        {
          id: 1,
          documentId: "t",
          publishedAt: "2025-01-01T00:00:00.000Z",
          headline: "Gründung",
          description: "Text",
          date: "2011-06-01",
        },
        ids,
      ),
    ).toMatchObject({ title: "Gründung", year: "2011" });
  });

  it("passes an unparseable date through unchanged", () => {
    expect(
      mapTimelineItem(
        {
          id: 2,
          documentId: "t2",
          publishedAt: "2025-01-01T00:00:00.000Z",
          headline: "X",
          date: "irgendwann",
        },
        ids,
      ).year,
    ).toBe("irgendwann");
  });
});

describe("page slugs", () => {
  it("renames the two slugs the site routes expect", () => {
    expect(PAGE_SLUGS["partner"]).toBe("supporter");
    expect(PAGE_SLUGS["projekt"]).toBe("projekte");
  });

  it("keeps kontakt and teams verbatim", () => {
    expect(PAGE_SLUGS["kontakt"]).toBe("kontakt");
    expect(PAGE_SLUGS["teams"]).toBe("teams");
  });

  it("seeds the three pages Strapi never had", () => {
    expect(SEEDED_PAGES.map((page) => page.slug)).toEqual([
      "story",
      "philosophie",
      "probetraining",
    ]);
  });

  it("maps a page through the slug table", () => {
    expect(
      mapPage(
        {
          id: 48,
          documentId: "p",
          publishedAt: "2025-01-01T00:00:00.000Z",
          slug: "partner",
          header: { title: "Supporter", image: null },
        },
        ids,
      ),
    ).toMatchObject({ slug: "supporter", header: { title: "Supporter", image: null }, layout: [] });
  });

  it("passes an unmapped slug through unchanged rather than dropping the page", () => {
    expect(
      mapPage(
        {
          id: 99,
          documentId: "n",
          publishedAt: "2025-01-01T00:00:00.000Z",
          slug: "brandneu",
          header: null,
        },
        ids,
      ).slug,
    ).toBe("brandneu");
  });
});

describe("mapPost", () => {
  it("takes the title from the header component and publishedDate from publishedAt", () => {
    expect(
      mapPost(
        {
          id: 17,
          documentId: "a",
          publishedAt: "2025-08-11T20:58:56.822Z",
          slug: "neue-webseite",
          header: { title: "Neue Webseite", image: { id: 20 } },
          gallery: [{ id: 1 }, { id: 2 }],
        },
        { media: new Map([[20, 200], [1, 10], [2, 20]]) },
        { root: {} },
      ),
    ).toMatchObject({
      title: "Neue Webseite",
      slug: "neue-webseite",
      publishedDate: "2025-08-11T20:58:56.822Z",
      headerImage: 200,
      gallery: [10, 20],
      _status: "published",
    });
  });

  it("derives a slug from the title when Strapi left it null", () => {
    // The real "Caritas Spendenspieltag" post; Payload requires a unique slug.
    expect(
      mapPost(
        {
          id: 30,
          documentId: "b",
          publishedAt: "2026-07-05T20:10:17.080Z",
          slug: null,
          header: { title: "Caritas Spendenspieltag", image: null },
        },
        ids,
        { root: {} },
      ).slug,
    ).toBe("caritas-spendenspieltag");
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `pnpm --filter @dragons/cms test -- mappers`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the mappers**

```ts
// apps/cms/scripts/migrate-strapi/mappers.ts
import type { StrapiDoc } from "./strapi";

/** Strapi id → Payload id, one map per already-migrated collection. */
export interface IdMaps {
  media?: Map<number, number>;
  people?: Map<number, number>;
  trainers?: Map<number, number>;
}

type Rel = { id: number } | null | undefined;

function rel(value: unknown, map: Map<number, number> | undefined): number | null {
  const ref = value as Rel;
  if (ref == null || map === undefined) return null;
  return map.get(ref.id) ?? null;
}

function rels(value: unknown, map: Map<number, number> | undefined): number[] {
  const refs = (value ?? []) as { id: number }[];
  if (map === undefined) return [];
  return refs.flatMap((ref) => {
    const id = map.get(ref.id);
    return id === undefined ? [] : [id];
  });
}

const UMLAUTS: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  ß: "ss",
};

/** Slug rule for the one post Strapi left without one. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äöüß]/g, (char) => UMLAUTS[char] ?? char)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function publishedStatus(doc: { publishedAt: string | null }): "draft" | "published" {
  return doc.publishedAt === null ? "draft" : "published";
}

/**
 * Team slug → apiTeamPermanentId, the join key to apps/api /public/teams.
 * Hand-mapped because Strapi has no such field. Read from the live response on
 * 2026-08-03 by joining the API's `customName` ("Damen 1") to the Strapi team
 * `name` — all nine matched exactly. index.ts asserts every migrated slug has
 * an entry, so a new team fails the run instead of silently losing its join.
 */
export const TEAM_PERMANENT_IDS: Record<string, number> = {
  "damen-1": 320674,
  "damen-2": 320914,
  "damen-3": 169051,
  "herren-1": 160402,
  "herren-2": 159858,
  u12: 290564,
  u14: 290567,
  u16: 290571,
  u18: 159888,
};

/** Strapi page slug → Payload page slug (D8). */
export const PAGE_SLUGS: Record<string, string> = {
  partner: "supporter",
  projekt: "projekte",
  news: "news",
  downloads: "downloads",
  teams: "teams",
  kontakt: "kontakt",
};

/**
 * Pages the site routes ask for that Strapi never had. Titles are the site's
 * current hardcoded headings (apps/site/src/lib/strings.ts), so seeding them
 * changes nothing visually while making the headers CMS-editable.
 */
export const SEEDED_PAGES = [
  { slug: "story", title: "Dragons Story" },
  { slug: "philosophie", title: "Dragons Philosophie" },
  { slug: "probetraining", title: "Probetraining" },
] as const;

export function mapPerson(doc: StrapiDoc, ids: IdMaps) {
  return {
    name: doc.name as string,
    email: (doc.email as string | null) ?? null,
    phone: (doc.phone as string | null) ?? null,
    image: rel(doc.image, ids.media),
  };
}

export function mapPosition(doc: StrapiDoc, ids: IdMaps) {
  return {
    name: doc.name as string,
    tasks: (doc.tasks as string | null) ?? null,
    email: (doc.email as string | null) ?? null,
    orderIndex: (doc.orderIndex as number | null) ?? 0,
    people: rels(doc.ehrenamtliche == null ? [] : [doc.ehrenamtliche], ids.people),
    _status: publishedStatus(doc),
  };
}

export function mapVorstand(doc: StrapiDoc, ids: IdMaps) {
  return {
    // Strapi stores the role title in `name` ("Kassenwart").
    role: doc.name as string,
    tasks: (doc.tasks as string | null) ?? null,
    orderIndex: (doc.orderIndex as number | null) ?? 0,
    person: rel(doc.ehrenamtliche, ids.people),
    image: rel(doc.image, ids.media),
    _status: publishedStatus(doc),
  };
}

export function mapTrainer(doc: StrapiDoc, ids: IdMaps) {
  return {
    person: rel(doc.ehrenamtliche, ids.people),
    licence: (doc.lizenz as string | null) ?? null,
    email: (doc.email as string | null) ?? null,
    image: rel(doc.image, ids.media),
  };
}

export function mapReferee(doc: StrapiDoc, ids: IdMaps) {
  return {
    person: rel(doc.ehrenamtliche, ids.people),
    licence: (doc.lizenz as string | null) ?? null,
    image: rel(doc.image, ids.media),
    _status: publishedStatus(doc),
  };
}

interface StrapiTraining {
  day: string;
  startTime: string;
  endTime: string | null;
  gym: string;
  info: string | null;
}

export function mapTeam(doc: StrapiDoc, ids: IdMaps) {
  const slug = doc.slug as string;
  return {
    name: doc.name as string,
    slug,
    orderIndex: (doc.orderIndex as number | null) ?? 0,
    teamImage: rel(doc.teamImage, ids.media),
    apiTeamPermanentId: TEAM_PERMANENT_IDS[slug] ?? null,
    leagueName: (doc.leagueName as string | null) ?? null,
    leagueId: (doc.leagueId as string | null) ?? null,
    trainers: rels(doc.trainer, ids.trainers),
    trainingTimes: ((doc.training ?? []) as StrapiTraining[]).map((time) => ({
      day: time.day,
      startTime: time.startTime,
      endTime: time.endTime ?? null,
      gym: time.gym,
      // No Strapi source — editors fill it in Payload.
      gymMapsUrl: null,
      info: time.info ?? null,
    })),
    _status: publishedStatus(doc),
  };
}

export function mapPartner(doc: StrapiDoc, ids: IdMaps, orderIndex: number) {
  return {
    name: doc.name as string,
    description: (doc.beschreibung as string | null) ?? null,
    logo: rel(doc.logo, ids.media),
    url: (doc.link as string | null) ?? null,
    // No Strapi source; assigned by id ascending so the site's
    // sort: "orderIndex" is deterministic and editable afterwards.
    orderIndex,
    _status: publishedStatus(doc),
  };
}

export function mapProject(doc: StrapiDoc, ids: IdMaps) {
  return {
    title: doc.name as string,
    description: (doc.beschreibung as string | null) ?? null,
    image: rel(doc.logo, ids.media),
    link: (doc.link as string | null) ?? null,
    _status: publishedStatus(doc),
  };
}

export function mapDownload(doc: StrapiDoc, ids: IdMaps) {
  return {
    title: doc.name as string,
    file: rel(doc.file, ids.media),
    // No Strapi source.
    category: null,
    // The site sorts downloads on createdAt; Strapi's publishedAt is what the
    // legacy cards rendered, so it has to carry over rather than being "now".
    createdAt: doc.publishedAt,
    _status: publishedStatus(doc),
  };
}

export function mapShopItem(doc: StrapiDoc, ids: IdMaps) {
  return {
    name: doc.name as string,
    images: rels(doc.images, ids.media),
    price: (doc.price as number | null) ?? null,
    link: (doc.link as string | null) ?? null,
    description: (doc.description as string | null) ?? null,
    _status: publishedStatus(doc),
  };
}

export function mapTimelineItem(doc: StrapiDoc, ids: IdMaps) {
  const raw = doc.date as string | null;
  const parsed = raw === null ? Number.NaN : new Date(raw).getFullYear();
  return {
    title: doc.headline as string,
    description: (doc.description as string | null) ?? null,
    year: Number.isNaN(parsed) ? raw : String(parsed),
    // No Strapi source.
    image: rel(doc.image, ids.media),
    _status: publishedStatus(doc),
  };
}

export function mapPage(doc: StrapiDoc, ids: IdMaps) {
  const header = (doc.header ?? null) as { title: string | null; image: unknown } | null;
  const strapiSlug = doc.slug as string;
  return {
    slug: PAGE_SLUGS[strapiSlug] ?? strapiSlug,
    header: {
      title: header?.title ?? null,
      image: rel(header?.image, ids.media),
    },
    // Every Strapi dynamic zone is empty — see the spec, correction 3.
    layout: [],
    _status: publishedStatus(doc),
  };
}

export function mapPost(doc: StrapiDoc, ids: IdMaps, content: unknown) {
  const header = (doc.header ?? null) as { title: string; image: unknown } | null;
  const title = header?.title ?? "Ohne Titel";
  return {
    title,
    // One real post has slug: null; Payload requires a unique slug.
    slug: (doc.slug as string | null) ?? slugify(title),
    publishedDate: doc.publishedAt,
    headerImage: rel(header?.image, ids.media),
    content,
    gallery: rels(doc.gallery, ids.media),
    _status: publishedStatus(doc),
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @dragons/cms test -- mappers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/cms/scripts/migrate-strapi/
git commit -m "feat(cms): strapi to payload field mappers"
```

---

### Task 9: Media pipeline

73 files, 61.5 MB. Sequential, not concurrent: the CMS is a scale-to-zero Cloud Run container with 1 GiB for sharp, and 73 files is too few for parallelism to be worth memory pressure during blurhash encoding.

**Files:**
- Create: `apps/cms/scripts/migrate-strapi/media.ts`

**Interfaces:**
- Consumes: `fetchUploads`, `downloadFile` (Task 6), `createUpload` (Task 6).
- Produces: `migrateMedia(): Promise<Map<number, number>>` — Strapi file id → Payload media id.

- [ ] **Step 1: Implement it**

```ts
// apps/cms/scripts/migrate-strapi/media.ts
import { createUpload } from "./payload-client";
import { downloadFile, fetchUploads } from "./strapi";

/**
 * Uploads every Strapi file into Payload media and returns the id map every
 * later collection run needs.
 *
 * Sequential on purpose: 73 files against a scale-to-zero Cloud Run container
 * that runs sharp + blurhash per image. Concurrency buys seconds and risks
 * memory pressure.
 *
 * Strapi's derived `formats` (thumbnail/small/medium) are not migrated —
 * Payload and the site generate their own.
 */
export async function migrateMedia(): Promise<Map<number, number>> {
  const files = await fetchUploads();
  const map = new Map<number, number>();
  let index = 0;
  for (const file of files) {
    index += 1;
    const blob = await downloadFile(file.url);
    // Strapi hashes filenames on upload, so file.url's basename is already
    // safe — no spaces, parentheses or umlauts, whatever the display name is.
    const filename = file.url.split("/").pop() ?? file.name;
    const doc = await createUpload("media", blob, filename, { alt: file.alternativeText });
    map.set(file.id, doc.id);
    console.log(`  media ${index}/${files.length}  ${filename} → ${doc.id}`);
  }
  return map;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @dragons/cms typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/cms/scripts/migrate-strapi/media.ts
git commit -m "feat(cms): media migration pipeline"
```

---

### Task 10: Orchestration and verification

**Files:**
- Create: `apps/cms/scripts/migrate-strapi/index.ts`

**Interfaces:**
- Consumes: everything from Tasks 6–9.
- Produces: a runnable `pnpm --filter @dragons/cms migrate:strapi` that exits non-zero on any count mismatch.

- [ ] **Step 1: Implement the orchestrator**

```ts
// apps/cms/scripts/migrate-strapi/index.ts
import { strapiBlocksToLexical, type StrapiBlock } from "./convert-blocks";
import {
  PAGE_SLUGS,
  SEEDED_PAGES,
  TEAM_PERMANENT_IDS,
  mapDownload,
  mapPage,
  mapPartner,
  mapPerson,
  mapPosition,
  mapPost,
  mapProject,
  mapReferee,
  mapShopItem,
  mapTeam,
  mapTimelineItem,
  mapTrainer,
  mapVorstand,
  type IdMaps,
} from "./mappers";
import { migrateMedia } from "./media";
import { countDocs, createDoc, deleteAll, updateGlobal } from "./payload-client";
import { fetchAll, fetchSingle, fetchUploads, type StrapiDoc } from "./strapi";

/** Wiped and refilled on every run, in dependency order. */
const TARGETS = [
  "media",
  "people",
  "positions",
  "vorstand",
  "trainers",
  "referees",
  "teams",
  "partners",
  "projects",
  "downloads",
  "shop-items",
  "timeline-items",
  "pages",
  "posts",
] as const;

async function run<T extends Record<string, unknown>>(
  collection: string,
  docs: StrapiDoc[],
  map: (doc: StrapiDoc, index: number) => T | Promise<T>,
): Promise<Map<number, number>> {
  const ids = new Map<number, number>();
  let index = 0;
  for (const doc of docs) {
    const created = await createDoc(collection, await map(doc, index));
    ids.set(doc.id, created.id);
    index += 1;
  }
  console.log(`  ${collection}: ${ids.size}`);
  return ids;
}

async function main(): Promise<void> {
  // Preflight: a team added in Strapi since the map was written would migrate
  // with a null join key and silently lose its live standings. Fail instead.
  const strapiTeams = await fetchAll("teams");
  const unmapped = strapiTeams
    .map((team) => team.slug as string)
    .filter((slug) => TEAM_PERMANENT_IDS[slug] === undefined);
  if (unmapped.length > 0) {
    throw new Error(
      `mappers.TEAM_PERMANENT_IDS has no entry for: ${unmapped.join(", ")} — ` +
        "read the value from /public/teams (join on customName) before running",
    );
  }

  console.log("wiping target collections");
  for (const collection of [...TARGETS].reverse()) {
    const deleted = await deleteAll(collection);
    console.log(`  ${collection}: -${deleted}`);
  }

  console.log("media");
  const media = await migrateMedia();
  const ids: IdMaps = { media };

  console.log("content");
  ids.people = await run("people", await fetchAll("ehrenamtliches"), (doc) => mapPerson(doc, ids));
  await run("positions", await fetchAll("positions"), (doc) => mapPosition(doc, ids));
  await run("vorstand", await fetchAll("vorstands"), (doc) => mapVorstand(doc, ids));
  ids.trainers = await run("trainers", await fetchAll("trainers"), (doc) => mapTrainer(doc, ids));
  await run("referees", await fetchAll("schiedsrichters"), (doc) => mapReferee(doc, ids));
  await run("teams", strapiTeams, (doc) => mapTeam(doc, ids));

  // Partners are the one collection with an unpublished document, so they are
  // read with status=draft — Strapi 5 returns the draft version of every
  // document, which for published ones is identical.
  await run("partners", await fetchAll("partners", { status: "draft" }), (doc, index) =>
    mapPartner(doc, ids, index),
  );

  await run("projects", await fetchAll("projects"), (doc) => mapProject(doc, ids));
  await run("downloads", await fetchAll("downloads"), (doc) => mapDownload(doc, ids));
  await run("shop-items", await fetchAll("shop-items"), (doc) => mapShopItem(doc, ids));
  await run("timeline-items", await fetchAll("timeline-items"), (doc) =>
    mapTimelineItem(doc, ids),
  );

  const strapiPages = await fetchAll("pages");
  await run("pages", strapiPages, (doc) => mapPage(doc, ids));
  for (const seeded of SEEDED_PAGES) {
    await createDoc("pages", {
      slug: seeded.slug,
      header: { title: seeded.title, image: null },
      layout: [],
      _status: "published",
    });
  }
  console.log(`  pages seeded: ${SEEDED_PAGES.length}`);

  const strapiPosts = await fetchAll("posts");
  await run("posts", strapiPosts, async (doc) =>
    mapPost(doc, ids, await strapiBlocksToLexical((doc.content ?? []) as StrapiBlock[], media)),
  );

  console.log("globals");
  const teamBackground = await fetchSingle("team-background");
  if (teamBackground !== null) {
    await updateGlobal("team-background", {
      image: media.get((teamBackground.image as { id: number }).id) ?? null,
    });
  }
  const backgroundVideo = await fetchSingle("background-video");
  if (backgroundVideo !== null) {
    await updateGlobal("background-video", {
      video: media.get((backgroundVideo.video as { id: number }).id) ?? null,
    });
  }
  // site-settings is deliberately untouched: Strapi has no source for it and
  // the values were entered by hand during issue #182.

  console.log("\nverification");
  const counts: [string, number, number][] = [];

  // Media is counted from the upload library, not a content type.
  const strapiMedia = (await fetchUploads()).length;
  const payloadMedia = await countDocs("media");
  counts.push(["media", strapiMedia, payloadMedia]);
  let failed = strapiMedia !== payloadMedia;

  const strapiCounts: Record<string, number> = {
    people: (await fetchAll("ehrenamtliches")).length,
    positions: (await fetchAll("positions")).length,
    vorstand: (await fetchAll("vorstands")).length,
    trainers: (await fetchAll("trainers")).length,
    referees: (await fetchAll("schiedsrichters")).length,
    teams: strapiTeams.length,
    partners: (await fetchAll("partners", { status: "draft" })).length,
    projects: (await fetchAll("projects")).length,
    downloads: (await fetchAll("downloads")).length,
    "shop-items": (await fetchAll("shop-items")).length,
    "timeline-items": (await fetchAll("timeline-items")).length,
    posts: strapiPosts.length,
    // The one collection where Payload deliberately holds more than Strapi.
    pages: strapiPages.length + SEEDED_PAGES.length,
  };

  for (const [collection, want] of Object.entries(strapiCounts)) {
    const got = await countDocs(collection);
    counts.push([collection, want, got]);
    if (got !== want) failed = true;
  }

  for (const [collection, want, got] of counts) {
    console.log(`  ${collection.padEnd(16)} strapi=${String(want).padEnd(4)} payload=${got}${got === want ? "" : "   MISMATCH"}`);
  }

  const slugsWritten = Object.values(PAGE_SLUGS);
  console.log(`  page slugs: ${slugsWritten.join(", ")}, ${SEEDED_PAGES.map((p) => p.slug).join(", ")}`);

  if (failed) {
    console.error("\nFAILED: counts do not match");
    process.exit(1);
  }
  console.log("\nOK");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @dragons/cms typecheck`
Expected: no errors.

- [ ] **Step 3: Dry-run against a LOCAL Payload first — never prod on the first attempt**

```bash
pnpm --filter @dragons/cms dev   # in another terminal, admin at localhost:3002
# create a local admin + an API key user, then:
export STRAPI_URL=https://cms.hbdragons.de
export STRAPI_TOKEN=$(cat /private/tmp/claude-501/-Users-jn-git-dragons-cms/c447e72f-f5ba-49c9-864a-fee562527ad8/scratchpad/.strapi_token)
export CMS_URL=http://localhost:3002
export CMS_API_TOKEN=<local build user key>
pnpm --filter @dragons/cms migrate:strapi
```

Expected: every collection reports its count, the verification table shows no MISMATCH, and the script prints `OK`.

- [ ] **Step 4: Spot-check the local result in the admin**

Open `http://localhost:3002/admin` and confirm: a post renders its rich text and gallery; a team shows league name, training times and its image; the SportCheck partner is a **draft**; `referees` holds 16 with licences.

- [ ] **Step 5: Commit**

```bash
git add apps/cms/scripts/migrate-strapi/index.ts
git commit -m "feat(cms): strapi migration orchestration and verification"
```

---

### Task 11: Site — the `publishedOnly` filter

Ten collections now carry `_status`. The build user's API key sees drafts, so every call site must filter. A missed filter leaks drafts to the live site silently, so the predicate is one tested seam rather than twelve inline lambdas.

**Files:**
- Create: `apps/site/src/lib/published.ts`, `apps/site/src/lib/published.test.ts`
- Modify: `apps/site/src/content.config.ts`
- Modify: 12 call sites listed below

**Interfaces:**
- Produces: `publishedOnly(entry: { data: { _status?: "draft" | "published" | null } }): boolean`, passed directly as `getCollection`'s second argument.

- [ ] **Step 1: Write the failing test**

```ts
// apps/site/src/lib/published.test.ts
import { describe, expect, it } from "vitest";

import { publishedOnly } from "./published";

describe("publishedOnly", () => {
  it("keeps published entries", () => {
    expect(publishedOnly({ data: { _status: "published" } })).toBe(true);
  });

  it("drops drafts", () => {
    expect(publishedOnly({ data: { _status: "draft" } })).toBe(false);
  });

  it("drops entries with no status rather than assuming published", () => {
    expect(publishedOnly({ data: {} })).toBe(false);
    expect(publishedOnly({ data: { _status: null } })).toBe(false);
  });
});
```

The third case is the deliberate choice: a collection that loses its drafts config should fail visibly (empty section) rather than silently publish everything.

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm --filter @dragons/site test -- published`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement it**

```ts
// apps/site/src/lib/published.ts

/**
 * Draft filter for every collection with `versions: { drafts: true }`.
 *
 * The build user's API key is authenticated, so Payload's `publishedOrAuthed`
 * read access hands it drafts as well as published documents. Every
 * getCollection call on a drafted collection must filter, or unpublished
 * content ships to the live site.
 *
 * Note this only guards the collection being loaded. A draft reached through a
 * *relation* (people → vorstand, trainers → teams) bypasses it entirely, which
 * is why apps/cms deliberately leaves people, trainers and media undrafted.
 */
export function publishedOnly(entry: {
  data: { _status?: "draft" | "published" | null | undefined };
}): boolean {
  return entry.data._status === "published";
}
```

- [ ] **Step 4: Add `_status` to the eight schemas**

In `apps/site/src/content.config.ts`, add `_status: status,` as the last property of the inline schema objects for: `teams` (the `team` const), `partners`, `projects`, `downloads`, `shopItems`, `timelineItems`, `vorstand`, `positions`. `post` and `page` already have it. Do **not** add it to `person` or `trainer`.

- [ ] **Step 5: Apply the filter at all twelve call sites**

Import `publishedOnly` from the right relative path in each file and pass it as the second argument:

| File | Change |
| --- | --- |
| `src/components/NavBar.astro:21` | `getCollection("teams", publishedOnly)` |
| `src/components/page-blocks/TeamListBlock.astro:24` | `getCollection("teams", publishedOnly)` |
| `src/pages/teams/index.astro:24` | `getCollection("teams", publishedOnly)` |
| `src/pages/teams/[slug].astro:24` | `getCollection("teams", publishedOnly)` |
| `src/components/page-blocks/DownloadListBlock.astro:19` | `getCollection("downloads", publishedOnly)` |
| `src/pages/downloads/index.astro:21` | `getCollection("downloads", publishedOnly)` |
| `src/components/page-blocks/ContactBlock.astro:25` | `getCollection("vorstand", publishedOnly)` |
| `src/components/page-blocks/ContactBlock.astro:26` | `getCollection("positions", publishedOnly)` |
| `src/pages/dragons/projekte/index.astro:25` | `getCollection("projects", publishedOnly)` |
| `src/pages/dragons/story/index.astro:22` | `getCollection("timelineItems", publishedOnly)` |
| `src/pages/shop/index.astro:12` | `getCollection("shopItems", publishedOnly)` |
| `src/pages/supporter/index.astro:26` | `getCollection("partners", publishedOnly)` |

Also replace the four existing inline lambdas with `publishedOnly` so there is one rule, not two:
`src/components/home/News.astro:18`, `src/components/page-blocks/NewsListBlock.astro:19`,
`src/pages/news/index.astro:20`, `src/pages/news/[slug].astro:22`.

- [ ] **Step 6: Verify no call site was missed**

Run: `grep -rn 'getCollection("' apps/site/src | grep -v "\.test\." | grep -v publishedOnly`
Expected: only `pages` (filtered by `publishedPage` in `lib/pages.ts`), `people` and `trainers` (undrafted by design) remain.

- [ ] **Step 7: Run tests, typecheck and build**

Run: `pnpm --filter @dragons/site test && pnpm --filter @dragons/site typecheck`
Expected: PASS at or above 97/100/99/99.

- [ ] **Step 8: Commit**

```bash
git add apps/site/src/
git commit -m "feat(site): filter drafts out of every drafted collection"
```

---

### Task 12: Site — shop price as a number

**Files:**
- Modify: `apps/site/src/content.config.ts` (shopItems schema)
- Modify: `apps/site/src/lib/format.ts`, `apps/site/src/lib/format.test.ts`
- Modify: `apps/site/src/components/shop/ProductCard.astro`

**Interfaces:**
- Produces: `formatPrice(price: number | null | undefined): string | null`.

- [ ] **Step 1: Update the failing tests**

In `apps/site/src/lib/format.test.ts`, replace the `formatPrice` cases:

```ts
describe("formatPrice", () => {
  it("formats a number as EUR the way the legacy site did", () => {
    expect(formatPrice(38.34)).toBe("38,34 €");
  });

  it("formats a whole number with cents", () => {
    expect(formatPrice(20)).toBe("20,00 €");
  });

  it("returns null when there is no price", () => {
    expect(formatPrice(null)).toBeNull();
    expect(formatPrice(undefined)).toBeNull();
  });

  it("formats zero rather than treating it as missing", () => {
    expect(formatPrice(0)).toBe("0,00 €");
  });
});
```

The zero case matters: `if (!price)` would drop a free item.

- [ ] **Step 2: Run and watch them fail**

Run: `pnpm --filter @dragons/site test -- format`
Expected: FAIL — a number is passed where a string is expected.

- [ ] **Step 3: Rewrite formatPrice**

Replace `NUMERIC_PRICE` and `formatPrice` in `apps/site/src/lib/format.ts`:

```ts
/**
 * Shop price, formatted like the legacy `Intl.NumberFormat` EUR output
 * ("38,34 €"). The CMS stores price as a number (issue #165, D3) — Strapi
 * stored it numerically and the previous free-text field could not be sorted
 * or compared.
 */
export function formatPrice(price: number | null | undefined): string | null {
  if (price == null || Number.isNaN(price)) return null;
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(price);
}
```

Delete the now-unused `NUMERIC_PRICE` constant.

- [ ] **Step 4: Update the content schema**

In `apps/site/src/content.config.ts`, in the `shopItems` schema:

```ts
      images: z.array(media).nullish(),
      price: z.number().nullish(),
```

(replacing `image: media.nullish(),` and `price: z.string().nullish(),`)

- [ ] **Step 5: Update ProductCard**

In `apps/site/src/components/shop/ProductCard.astro`, the price call is unchanged (`formatPrice(item.price)`) but the image reference must move to the array. Find the `item.image` usage and change it to `item.images?.[0] ?? null`.

Run: `grep -n "item.image" apps/site/src/components/shop/ProductCard.astro`

- [ ] **Step 6: Run tests, typecheck**

Run: `pnpm --filter @dragons/site test && pnpm --filter @dragons/site typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/site/src/
git commit -m "feat(site): shop prices as numbers and multiple product images"
```

---

### Task 13: Site — the three missing contact sections

D12. The live legacy `/dragons/team` shows Vorstand (3), Ehrenamtliche (8), Coaches (6) and Refs (16). The Astro page shows only Coaches, because the other sections live in `ContactBlock.astro`, which only renders from a `pages.layout` block — and every Strapi dynamic zone is empty. Without this task, cutover loses three sections.

**Files:**
- Create: `apps/site/src/components/kontakt/VorstandGrid.astro`, `PositionsGrid.astro`, `RefereesGrid.astro`
- Modify: `apps/site/src/components/page-blocks/ContactBlock.astro`
- Modify: `apps/site/src/pages/dragons/team/index.astro`
- Modify: `apps/site/src/content.config.ts` (add the `referees` collection)
- Modify: `apps/site/src/lib/strings.ts` (add the Refs heading)

**Interfaces:**
- Consumes: `publishedOnly` (Task 11), `PersonCard`, `vorstandClipDirection` and `resolveRefs` from `lib/page-blocks.ts`.
- Produces: `<VorstandGrid entries={…} />`, `<PositionsGrid entries={…} />`, `<RefereesGrid entries={…} />` — each takes an already-resolved, already-sorted array so both the block and the page can drive them.

- [ ] **Step 1: Add the referees collection to the site**

In `apps/site/src/content.config.ts`, add after the `trainers` entry:

```ts
  referees: defineCollection({
    // depth 2: referees → person → person.image populated.
    loader: payloadLoader("referees", { depth: 2 }),
    schema: z.object({
      id: z.number(),
      person: person.nullish(),
      licence: z.string().nullish(),
      image: media.nullish(),
      _status: status,
    }),
  }),
```

- [ ] **Step 2: Add the heading string**

In `apps/site/src/lib/strings.ts`, inside `dragons.team`, add after `coachesHeading`:

```ts
      refereesHeading: "Unsere Refs",
```

- [ ] **Step 3: Extract the Vorstand grid**

```astro
---
// apps/site/src/components/kontakt/VorstandGrid.astro
/**
 * Vorstand band (angled cards). Takes already-resolved, already-sorted entries
 * so both ContactBlock (a page-layout block) and the contact page can render
 * the same markup.
 */
import type { CollectionEntry } from "astro:content";

import { cmsBaseUrl } from "../../lib/media";
import { vorstandClipDirection } from "../../lib/page-blocks";
import { toSiteImage } from "../../lib/site-image";
import { strings } from "../../lib/strings";
import PersonCard from "./PersonCard.astro";

interface Props {
  entries: CollectionEntry<"vorstand">["data"][];
}

const { entries } = Astro.props;
const cmsBase = cmsBaseUrl();
---

{
  entries.length > 0 && (
    <div>
      <h2 class="text-3xl font-bold text-foreground mb-8 text-center">
        {strings.dragons.team.vorstandHeading}
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-0 md:-space-x-4 lg:-space-x-6 xl:-space-x-8">
        {entries.map((entry, index) => (
          <div class="relative flex-1">
            <PersonCard
              name={entry.role}
              personName={entry.person?.name}
              email={entry.person?.email}
              image={toSiteImage(entry.image ?? entry.person?.image, cmsBase)}
              clipDirection={vorstandClipDirection(index, entries.length)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Extract the positions grid**

```astro
---
// apps/site/src/components/kontakt/PositionsGrid.astro
/**
 * Ehrenamtliche grid. Legacy Strapi positions carried one person each; Payload
 * allows several per position — one card per person, position name repeated.
 */
import type { CollectionEntry } from "astro:content";

import { cmsBaseUrl } from "../../lib/media";
import { toSiteImage } from "../../lib/site-image";
import { strings } from "../../lib/strings";
import PersonCard from "./PersonCard.astro";

type PositionEntry = CollectionEntry<"positions">["data"];
type PersonEntry = NonNullable<PositionEntry["people"]>[number];

interface Props {
  entries: PositionEntry[];
}

const { entries } = Astro.props;
const cmsBase = cmsBaseUrl();

const cards = entries.flatMap(
  (position): { position: PositionEntry; person: PersonEntry | null }[] => {
    const people = position.people ?? [];
    if (people.length === 0) return [{ position, person: null }];
    return people.map((person) => ({ position, person }));
  },
);
---

{
  cards.length > 0 && (
    <div>
      <h2 class="text-3xl font-bold text-foreground mt-8 mb-8 text-center">
        {strings.dragons.team.positionsHeading}
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 md:gap-4 md:-space-x-12">
        {cards.map(({ position, person }) => (
          <div class="w-full overflow-hidden rounded-md">
            <PersonCard
              name={position.name}
              personName={person?.name}
              email={position.email}
              image={toSiteImage(person?.image, cmsBase)}
              clipDirection="none"
              showEmail={true}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create the referees grid**

Mirrors the Coaches grid already in `dragons/team/index.astro`, with the licence as a badge.

```astro
---
// apps/site/src/components/kontakt/RefereesGrid.astro
/**
 * Refs grid. Mirrors the Coaches grid: person photo with the licence
 * ("2. REGIONALLIGA", "REGION HANNOVER") as a badge. Some entries are
 * deliberate placeholders in the CMS and render as-is, matching the legacy site.
 */
import type { CollectionEntry } from "astro:content";

import { cmsBaseUrl } from "../../lib/media";
import { toSiteImage } from "../../lib/site-image";
import { strings } from "../../lib/strings";
import PersonCard from "./PersonCard.astro";

interface Props {
  entries: CollectionEntry<"referees">["data"][];
}

const { entries } = Astro.props;
const cmsBase = cmsBaseUrl();
---

{
  entries.length > 0 && (
    <div>
      <h2 class="text-3xl font-bold text-foreground mt-8 mb-8 text-center">
        {strings.dragons.team.refereesHeading}
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 md:gap-4 md:-space-x-12">
        {entries.map((referee) => (
          <div class="w-full overflow-hidden rounded-md">
            <PersonCard
              name={referee.person?.name}
              image={toSiteImage(referee.image ?? referee.person?.image, cmsBase)}
              clipDirection="none"
              showEmail={false}
            >
              {referee.licence && (
                <span
                  slot="subTitle"
                  class="inline-flex items-center px-2.5 py-1.5 gap-1.5 rounded-md text-foreground bg-card text-base font-semibold uppercase"
                >
                  {referee.licence}
                </span>
              )}
            </PersonCard>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Make ContactBlock delegate**

Replace the markup at the bottom of `apps/site/src/components/page-blocks/ContactBlock.astro` with the two grids, keeping its `resolveRefs` joins:

```astro
<VorstandGrid entries={vorstand} />
<PositionsGrid entries={positions} />
```

Add the imports and delete the now-duplicated markup and the `positionCards` computation (it moved into `PositionsGrid`). Keep `getCollection("vorstand", publishedOnly)` / `getCollection("positions", publishedOnly)` from Task 11.

- [ ] **Step 7: Render all four sections on the contact page**

In `apps/site/src/pages/dragons/team/index.astro`, add the loads after the existing `trainers` line:

```ts
const vorstand = (await getCollection("vorstand", publishedOnly))
  .map((entry) => entry.data)
  .sort((a, b) => a.orderIndex - b.orderIndex);
const positions = (await getCollection("positions", publishedOnly))
  .map((entry) => entry.data)
  .sort((a, b) => a.orderIndex - b.orderIndex);
const referees = (await getCollection("referees", publishedOnly)).map((entry) => entry.data);
```

and render them inside `<PageContainer>`, before the existing Coaches block and after `<PageBlocks layout={page?.layout} />`:

```astro
    <VorstandGrid entries={vorstand} />
    <PositionsGrid entries={positions} />
```

then after the Coaches block:

```astro
    <RefereesGrid entries={referees} />
```

Import the three components and `publishedOnly`.

- [ ] **Step 8: Verify against the legacy site**

Run: `pnpm --filter @dragons/site test && pnpm --filter @dragons/site typecheck && pnpm --filter @dragons/site build`

With a locally migrated CMS running (Task 10, Step 3) and `CMS_URL`/`CMS_API_TOKEN` exported, build and preview, then compare `/dragons/team` against `https://hbdragons.de/dragons/team`. All four section headings must be present with the same people.

- [ ] **Step 9: Commit**

```bash
git add apps/site/src/
git commit -m "feat(site): render vorstand, ehrenamtliche and refs on the contact page"
```

---

## Production run (after all tasks, HITL)

Not a code task — the runbook the spec's verification section describes.

1. **Declare the content freeze** on Strapi.
2. Deploy `apps/cms` so the new schema and the `?skipRebuild=true` hook are live. The boot migration runs automatically via `src/instrumentation.ts`. Note issue #136: main CI concludes "cancelled" when Dependency Audit times out, which silently skips `deploy.yml` — use `gh workflow run deploy.yml --ref main -f services=cms` to bypass.
3. Run against production:
   ```bash
   export STRAPI_URL=https://cms.hbdragons.de
   export STRAPI_TOKEN=<the token>
   export CMS_URL=https://cms.testing.hbdragons.de
   export CMS_API_TOKEN=<the build user's key>
   pnpm --filter @dragons/cms migrate:strapi
   ```
4. Confirm no `repository_dispatch` fired: check dragons-hub's Actions tab for `cms-publish` events during the run window.
5. Trigger a site rebuild, then browse `https://site.testing.hbdragons.de`:
   - `/dragons/team` matches the legacy page's four sections
   - `/supporter` does **not** show SportCheck
   - posts render rich text and galleries; teams show league names and training times
6. **Revoke the Strapi API token.**

## Notes for the implementer

- **Do not lower a coverage threshold.** If `apps/cms` coverage dips, the cause is almost certainly an untested branch in `dispatch-rebuild.ts` — Task 5's fourth test covers the `searchParams === undefined` path.
- **`payload migrate:create` needs a live database.** It reads the current schema to diff against. Generating it against the wrong database produces a migration that will fail at prod boot.
- The migration script lives outside `src/`, so it is excluded from `apps/cms` coverage by the existing `coverage.include`. That is deliberate — the pure logic in Tasks 7 and 8 is tested directly; wrapping `fetch` in tests would add no signal.
- If `payload generate:importmap` is ever run during this work, **set `GCS_MEDIA_BUCKET` first** — the import map only records components of plugins active at generation time, and a map generated without it makes the production admin render blank.
