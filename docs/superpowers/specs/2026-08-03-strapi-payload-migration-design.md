# Strapi → Payload one-off migration (issue #165)

Date: 2026-08-03
Issue: hb-dragons/dragons-hub#165
Supersedes the Task A6 sketch in `docs/plans/2026-08-01-public-site-migration.md`, which was written
against assumptions that live inspection disproved (see "Corrections to the plan").

## Goal

Move every piece of content and media out of the legacy Strapi (`https://cms.hbdragons.de`, kept
running on `sherlock`) into the production Payload CMS, scripted rather than hand-entered, so that
issue #183 can cut `hbdragons.de` over to the Astro site.

Governing principle, set by the user: **migrate everything Strapi holds, even where no site route
consumes it yet.** The site's current needs do not define the target schema. Team subpages, a teams
overview page, and other routes are planned, and their data must already be in the CMS.

## Corrections to the plan

Task A6 was written from assumptions that live inspection disproved. Anyone reading the old plan
alongside this spec should treat this list as authoritative.

1. **Strapi is v5.33.0, not v4.** Documents are flat (no `attributes` wrapper) and carry a
   `documentId`. `publicationState=preview` does not exist in v5 — the equivalent is
   `status=draft` / `status=published`.
2. **Strapi is reachable publicly over HTTPS.** `cms.hbdragons.de` resolves to `85.215.221.88` and
   answers anonymously. No LAN route to `sherlock` is required.
3. **All six page dynamic zones are empty.** Every `page` carries only `header.title`; no header
   images, `content: []` everywhere. The plan's Strapi-dynamic-zone → Payload-blocks mapping has
   nothing to migrate, and issue #165's acceptance criterion "the 4 block pages" is unsatisfiable as
   written. `pages.layout` is written empty for every page.
4. **The rich-text conversion is small.** Across all four posts combined: 21 paragraphs, 28 text
   nodes, 1 heading, 2 links, 1 bold mark. No lists, images, quotes or code blocks. This was
   budgeted as the 3–5 day risk; it is roughly an hour of work.
5. **`req.context` cannot be set over the REST API.** `createPayloadRequest` hard-sets
   `context: {}`; Payload's own test suite works around this with a hook that lifts query
   parameters into context. The existing `context.skipRebuild` guard is therefore unreachable from
   a REST client. See "Rebuild suppression".
6. **`privacy-policy` has no content type.** `src/api/privacy-policy/` is an empty directory and the
   endpoint 404s. Nothing to drop, nothing to migrate.

Revised estimate: well under a day, against the plan's 3–5 days.

## Live inventory

All counts verified against the live Strapi on 2026-08-03.

| Strapi type | count | target |
| --- | --- | --- |
| `post` | 4 | `posts` |
| `page` | 6 | `pages` (plus 3 seeded, see "Page mapping") |
| `team` | 9 | `teams` |
| `ehrenamtliche` | 25 | `people` |
| `vorstand` | 3 | `vorstand` |
| `position` | 8 | `positions` |
| `trainer` | 6 | `trainers` |
| `schiedsrichter` | 16 | `referees` (new) |
| `partner` | 4 (3 published + 1 draft) | `partners` |
| `download` | 3 | `downloads` |
| `shop-item` | 5 | `shop-items` |
| `project` | **0** | `projects` |
| `timeline-item` | **0** | `timeline-items` |
| `team-background` | 1 | `team-background` global |
| `background-video` | 1 | `background-video` global |
| upload library | **73 files, 61.5 MB** | `media` |
| `gym` | 3 | dropped |
| `probetraining` | ≥100 | dropped |

Measured with a full-access Strapi API token on 2026-08-03, after the anonymous 403s were lifted.

**`projects` and `timeline-items` are genuinely empty**, not merely unreadable. Confirmed against the
live legacy site: `/dragons/projekte` renders "Aktuelle Projekte" with no items and `/dragons/story`
is a bare heading. Their mappers are still written (they define the field contract and the
collections exist in Payload), but they will migrate zero documents.

Media notes: the largest file is `trailer.webm` at 11.4 MB, well under Cloud Run's 32 MB request
limit. Filenames are safe — Strapi hashes them on upload (`Beitragssaetze_01_08_2025_c18a389de6.pdf`
for a source file named `Beitragssätze_01_08_2025.pdf`), so no spaces, parentheses or umlauts ever
reach a URL, even though several display names contain them. Two pairs share a *display* name
(`IMG_1769.webp`,
`IMG_3989 (1).webp`) but are distinct files with distinct hashes and distinct referrers; both
migrate. Every document in every collection has a published version except the one partner below.

## Decisions

All taken by the user on 2026-08-03.

| # | Decision | Rationale |
| --- | --- | --- |
| D1 | Write via **prod REST + `CMS_API_TOKEN`** against `https://cms.testing.hbdragons.de` | No Cloud SQL proxy and no local GCS credentials — the Cloud Run container already holds both. The Local API alternative needs two credential paths that do not exist. |
| D2 | **Extend the Payload schema** so no Strapi field is lost | Governing principle. Five fields had no target. |
| D3 | `shopItems.price` becomes a **number** | Strapi stores `38.34` as a number. Accepted cost: ripples into `apps/site`. |
| D4 | **Migrate referees**, drop gyms | Referees are club data worth keeping. Gym names already live as text on `teams.trainingTimes.gym`. |
| D5 | **Drop the `en` locale** | Payload has no localization configured; enabling it is its own ticket. Only 4 of 9 pages have English. The text stays in Strapi. |
| D6 | **Drop probetraining submissions outright**, no CSV snapshot | Personal data with no ongoing purpose; new submissions already go to `apps/api`. Recoverable from Strapi if ever needed. |
| D7 | Suppress rebuilds via a **`?skipRebuild=true` query parameter** honoured by the existing hook | See "Rebuild suppression". |
| D8 | Page slugs: rename `partner`→`supporter` and `projekt`→`projekte`; keep `kontakt` verbatim | `projekte` is the only slug genuinely broken today. Renaming `kontakt`→`team` would sit one letter from the `teams` page. |
| D9 | **Enable drafts on `partners`** | One partner ("SportCheck", `beschreibung: "tbd"`, no logo) is unpublished in Strapi. Payload's `partners` had no draft support, so it would have gone live on cutover. Drafts carry the unpublished state faithfully. |
| D10 | The one `.docx` upload was **deleted in Strapi by the user** | Payload's `media.mimeTypes` allows only `image/*`, `video/*` and `application/pdf`. Removing the file at source keeps `mimeTypes` unchanged and makes the count check exact at 73. |
| D11 | **Drafts on 8 more collections**: `teams`, `downloads`, `shopItems`, `projects`, `timelineItems`, `vorstand`, `positions`, `referees` | Editors want staging generally. Restricted to collections nothing relates to — see "Why not every collection". Done now because enabling drafts later on populated collections needs a `_status` backfill. |
| D12 | **Render Vorstand, Ehrenamtliche and Refs on the contact page** as part of this ticket | Without it, cutover loses three sections that the live legacy site shows today. See "Part 4". |

## Scope

Four parts, in order. This is not a script-only ticket.

### Part 1 — CMS schema changes (`apps/cms`)

| Change | Source data |
| --- | --- |
| `teams` gains `leagueName` (text), `leagueId` (text) | All 9 teams, e.g. `"2. Regionalliga Damen West"` / `"48668"` |
| `partners` gains `description` (textarea) | `partner.beschreibung`, long prose on all 3 |
| `shopItems.image` → `images` (upload, `hasMany: true`) | `shop-item.images` is an array |
| `shopItems.price` text → number | `shop-item.price` is a number |
| New `referees` collection | `{ person: relationship→people, licence: text, image: upload→media }`, mirroring `trainers` |
| `partners` gains `versions: { drafts: true }` and `access.read: publishedOrAuthed` | D9 — one unpublished partner |
| Same drafts treatment on `teams`, `downloads`, `shopItems`, `projects`, `timelineItems`, `vorstand`, `positions`, `referees` | D11 — editorial staging |

`leagueId` is text, not number, to match the Strapi type and to avoid implying it is the same join
key as `apiTeamPermanentId` — it is not; it identifies the league, not the team.

The new collection and both `shopItems` changes require `payload migrate:create` plus
`generate:types`. Production applies migrations on boot through `src/instrumentation.ts`.

Every one of these ripples into `apps/site`; that work is gathered in Part 4.

### Why not every collection gets drafts

`people`, `trainers` and `media` deliberately keep no drafts.

The site filters `_status === "published"` on the collection it loads, but the build user's API key
is authenticated, so `publishedOrAuthed` hands it drafts — and **a draft reached through a relation
never passes that filter**. `people` is populated into `vorstand`, `positions` and `trainers` at
depth 2; `trainers` into `teams` at depth 3; `media` into nearly everything. A drafted person would
render live inside a published `vorstand` entry, silently: `trainer.person` and `team.trainers` are
`.nullish()` in the zod schema, so nothing throws.

Making those safe means relation-level `_status` filtering inside the loaders — real logic, not a
one-line filter. Deferred. Conceptually it also fits: a person or an uploaded file has no publish
moment of its own; the thing that references it does.

The eight in D11 are safe because nothing relates to them. The `pages.layout` blocks nominally
relate to `teams`, `downloads`, `vorstand` and `positions`, but every dynamic zone is empty
(correction 3) and Part 4 renders those sections from the collections directly instead. If a block
is ever populated, this reasoning needs revisiting.

### Timing: why drafts must land during the migration

Enabling drafts on a collection that already holds rows adds a `_status` column those rows do not
populate, and the site's `=== "published"` filter would then hide **every existing document** until
someone backfills. Today these collections are empty and the migration writes `_status` explicitly
per document, so there is nothing to backfill. Deferring this turns a schema change into a data-fix
ticket against a live site.

### Part 2 — Rebuild suppression

`apps/cms/src/hooks/dispatch-rebuild.ts` already guards on `req.context?.skipRebuild`, but that is
unreachable over REST (correction 5). Without a fix, roughly 120 writes each fire a
`repository_dispatch` at dragons-hub.

The fix extends the existing guard to also honour `req.searchParams.get("skipRebuild") === "true"`,
in all three exported hooks (`dispatchOnPublish`, `dispatchOnDelete`, `dispatchGlobalOnChange`).
This is the pattern Payload uses in its own `test/hooks/collections/ContextHooks` fixture, narrowed
to a single known flag rather than a generic `context_*` prefix lifter. Writes require
authentication, so only editors and the build user can set it, and the daily deploy cron remains the
safety net.

Covered by the existing `dispatch-rebuild.test.ts`: a request carrying the parameter must not
dispatch; one without it must still dispatch.

Runbook fallback, not implemented in code: clearing `GH_DISPATCH_TOKEN` on the Cloud Run service
makes `dispatch()` a no-op, at the cost of two revision redeploys around the run.

### Part 3 — The migration script

```
apps/cms/scripts/migrate-strapi/
  index.ts           orchestration, wipe, ordered runs, count verification
  strapi.ts          paginated Strapi v5 reader
  media.ts           upload-library download + multipart create, builds mediaMap
  convert-blocks.ts  Strapi blocks → HTML → Lexical
  mappers.ts         pure Strapi-doc → Payload-doc functions, one per collection
  convert-blocks.test.ts
  mappers.test.ts
  fixtures/          real Strapi JSON pulled from the 4 posts
```

The seam that matters: `mappers.ts` is pure functions with no I/O, so the whole field contract is
unit-testable without touching either CMS. `strapi.ts` and `media.ts` own all network I/O.
`index.ts` owns ordering and reporting and nothing else.

Environment: `STRAPI_URL`, `STRAPI_TOKEN`, `CMS_URL`, `CMS_API_TOKEN`. Never committed.

### Part 4 — Site changes (`apps/site`)

**Draft filters (D9, D11).** Each newly drafted collection adds `_status: status` to its zod schema
in `src/content.config.ts`, and every call site filters published-only — the pattern `News.astro`,
`news/index.astro` and `lib/pages.ts` already use. The complete list, from a sweep of
`getCollection(` call sites:

| collection | call sites |
| --- | --- |
| `teams` | `components/NavBar.astro:21`, `components/page-blocks/TeamListBlock.astro:24`, `pages/teams/index.astro:24`, `pages/teams/[slug].astro:24` |
| `downloads` | `components/page-blocks/DownloadListBlock.astro:19`, `pages/downloads/index.astro:21` |
| `vorstand`, `positions` | `components/page-blocks/ContactBlock.astro:25-26`, plus the new contact sections below |
| `projects` | `pages/dragons/projekte/index.astro:25` |
| `timelineItems` | `pages/dragons/story/index.astro:22` |
| `shopItems` | `pages/shop/index.astro:12` |
| `partners` | `pages/supporter/index.astro:26` |
| `referees` | new — no existing call site |

A missed filter leaks drafts to the live site silently, so each one carries a test.

**`shopItems.price` as a number (D3).** `src/content.config.ts:178` (`z.string().nullish()` →
number), `src/lib/format.ts` `formatPrice` signature and body, `src/components/shop/ProductCard.astro`.

**Contact page sections (D12).** The live legacy `/dragons/team` renders four sections: *Unser
Vorstand* (3), *Unsere Ehrenamtlichen* (8 positions), *Unsere Coaches* (6 trainers), *Unsere Refs*
(16, each with a licence badge such as "2. REGIONALLIGA" or "REGION HANNOVER").

The Astro page renders only Coaches. `vorstand` and `positions` appear nowhere except
`ContactBlock.astro`, which renders through `<PageBlocks layout={page?.layout} />` — and `layout` is
empty on every page (correction 3), so that component never runs. It is dead code in practice.
Referees have no component at all.

So `pages/dragons/team/index.astro` gains the three missing sections, loading `vorstand`,
`positions` and `referees` directly and reusing the existing `ContactBlock` markup and `PersonCard`.
The Refs section is new: a `PersonCard` grid with the licence rendered as a badge, mirroring how the
Coaches section renders `trainer.licence`.

`ContactBlock.astro` stays as-is — it is the renderer for a populated `contact` block, which remains
a supported (if currently unused) authoring path.

## Field mapping

The contract. Everything not listed is dropped deliberately.

### media

`GET /api/upload/files` → download `${STRAPI_URL}${file.url}` → multipart `POST /api/media` with
`file` and `_payload: {"alt": alternativeText}`. `alt` is optional in Payload, so null passes
through. `blurhash` regenerates via the A2 `beforeChange` hook. Strapi's derived `formats`
(thumbnail/small/medium) are **not** migrated — Payload and the site generate their own.

73 files, 61.5 MB total. Uploads run sequentially rather than concurrently: the CMS is a
scale-to-zero Cloud Run container with 1 GiB for sharp, and 73 files is small enough that
parallelism buys nothing worth the risk of memory pressure during blurhash encoding.

Result: `mediaMap: Map<strapiFileId, payloadMediaId>`, consumed by every later run.

### people ← ehrenamtliche

`name` → `name`, `email` → `email`, `phone` → `phone`, `image` → `image` (via `mediaMap`).
25 docs, 14 with images.

### positions ← position

`name`, `tasks`, `email`, `orderIndex` map straight across; `ehrenamtliche` → `people` (hasMany).

### vorstand ← vorstand

`name` → **`role`** (Strapi stores the role title in `name`, e.g. `"Kassenwart"`), `tasks` → `tasks`,
`ehrenamtliche` → `person`, `orderIndex` → `orderIndex`, `image` → `image`.
German locale only (D5); `localizations` ignored.

### trainers ← trainer

`ehrenamtliche` → `person`, `lizenz` → `licence`, `email` → `email`, `image` → `image`.

### referees ← schiedsrichter (new collection)

`ehrenamtliche` → `person`, `lizenz` → `licence`, `image` → `image`. All 16 published.

These are visible on the live legacy site today (the *Unsere Refs* section), not speculative future
data — Part 4 restores that section on the Astro contact page. Some records are deliberate
placeholders (`name: "tbd"` with a licence set) and migrate as-is; they render on the live site now.

### teams ← team

`name`, `slug`, `orderIndex`, `teamImage`, `leagueName`, `leagueId` map straight across.
`trainer` → `trainers` (hasMany, via the trainers id map).
`training[]` → `trainingTimes[]`: `day`, `startTime`, `endTime`, `gym`, `info` map across;
`gymMapsUrl` has no Strapi source and stays empty.
`apiTeamPermanentId` comes from a literal slug → id map in `mappers.ts`, values read from the live
`apps/api` `/public/teams` response at implementation time.

Eight of nine teams have a `teamImage`; `damen-2` has none in Strapi and gets none. Four teams have
training entries (`u12`, `u14`, `u16`, `u18`); the five senior teams have none.

### partners ← partner

`name`, `beschreibung` → `description`, `logo` → `logo`, `link` → `url`.
`orderIndex` has no Strapi source — assigned from Strapi id ascending. The collection comment says
Strapi carries no order value, which is why the field is optional; assigning it anyway matters
because the site loads partners with `sort: "orderIndex"` and null ordering is not deterministic.

Publication state carries over (D9): the 3 published partners are written published, "SportCheck" is
written as a draft.

### projects ← project

**Zero documents to migrate.** The mapper is written anyway, so the contract is recorded and the
first project an editor creates behaves correctly: `name` → `title`, `beschreibung` → `description`,
`logo` → `image`, `link` → `link`.

### downloads ← download

`name` → `title`, `file` → `file`. `category` has no Strapi source and stays empty.
**`createdAt` is backfilled from Strapi `publishedAt`** — the site sorts downloads on it
(`content.config.ts`, flagged during #174).

### shopItems ← shop-item

`name`, `link`, `description` map across. `images` → `images` (all of them, hasMany per D2).
`price` → `price` as a number (D3).

### timelineItems ← timeline-item

**Zero documents to migrate.** Mapper written for the contract only:
`headline` → `title`, `description` → `description`, `date` → `year` (four-digit year of the parsed
date, raw string passed through with a warning if it fails to parse — `year` is a text field, so
nothing is lost either way). `image` has no Strapi source.

### pages ← page

`slug` per the table below, `header.title` → `header.title`, `header.image` → `header.image`
(no Strapi page actually has one). `layout` is written empty (correction 3).

| Payload slug | source | note |
| --- | --- | --- |
| `supporter` | Strapi `partner` | renamed to the live site route |
| `projekte` | Strapi `projekt` | renamed; the only slug broken today |
| `news` | Strapi `news` | |
| `downloads` | Strapi `downloads` | |
| `teams` | Strapi `teams` | retained for the planned teams overview page |
| `kontakt` | Strapi `kontakt` | kept verbatim; site falls back `team` → `kontakt` |
| `story` | seeded | `header.title` = `"Dragons Story"` |
| `philosophie` | seeded | `header.title` = `"Dragons Philosophie"` |
| `probetraining` | seeded | `header.title` = `"Probetraining"` |

Seed titles are the site's current hardcoded headings from `apps/site/src/lib/strings.ts`, so
migrating changes nothing visually while making every route's header CMS-editable.

All nine are created published.

### posts ← post

`header.title` → `title`, `slug` → `slug`, `publishedAt` → `publishedDate`,
`header.image` → `headerImage`, `gallery` → `gallery` (hasMany), `content` → `content` via the
converter.

Known data defect: the "Caritas Spendenspieltag" post has `slug: null` while Payload requires a
unique slug. Rule: slugify `header.title` (→ `caritas-spendenspieltag`) and log it at warning level
so the substitution is visible in the run output.

All four posts are published, so all four are created published.

### globals

`team-background.image` ← Strapi `team-background.image` (`kreis.webp`).
`background-video.video` ← Strapi `background-video.video` (`trailer-new.webm`, 2.7 MB — well under
Cloud Run's 32 MB request limit).

**`site-settings` is not touched.** Strapi has no source for it and the values (memberCount 130,
foundingYear 2011) were entered by hand during #182.

## Blocks → Lexical converter

Pipeline unchanged from the plan: Strapi block nodes → HTML string → `convertHTMLToLexical` from
`@payloadcms/richtext-lexical` (already pinned at 3.87.0) with `jsdom`, a **new devDependency** of
`@dragons/cms`. Dev-time only — `scripts/` is not part of the Docker build.

Written test-first against fixtures captured from the four real posts. The corpus needs only
`paragraph`, `heading` (with level), `link` (with url), and `text` with a `bold` mark. Implemented
defensively beyond that — `list`/`list-item` (ordered and unordered), `image` (via `mediaMap` to
`<img data-media-id>`), `quote`, `code`, and the `italic`/`underline`/`strikethrough`/`code` marks —
in case an editor adds one before the content freeze. Any unrecognised node type falls back to its
text content wrapped in a paragraph, and logs a warning naming the node type and post slug.

Empty paragraphs (`{"type":"paragraph","children":[{"text":""}]}`) are frequent in the real content
and are preserved as empty paragraphs — they carry the author's intended spacing.

## Idempotency and verification

The script deletes every document in its target collections before writing, so re-runs are safe and
a failed run leaves no partial state to reconcile by hand. Deletes carry `?skipRebuild=true` too.

It ends by printing a per-collection table of Strapi count versus Payload count and **exits non-zero
on any mismatch**, per the issue's acceptance criteria. Expected targets as of 2026-08-03:

```
media 73   people 25   positions 8   vorstand 3   trainers 6   referees 16
teams 9    partners 4 (3 published + 1 draft)     downloads 3  shop-items 5
projects 0 timeline-items 0                       pages 9 (6 migrated + 3 seeded)
posts 4    globals 2 (team-background, background-video)
```

`pages` is the one collection where the Payload count deliberately exceeds Strapi's (9 vs 6), so the
check compares against `strapiCount + seededCount` there rather than a bare equality.

Verification beyond counts, in order:

1. Converter unit tests pass against the real post fixtures.
2. Script's own count check passes.
3. Manual pass in the Payload admin: the 4 posts (rich text and galleries), the 9 pages, team
   training times and league names, referee licences.
4. Trigger a site rebuild, then browse `https://site.testing.hbdragons.de` — the browsable check
   the testing domains exist for. Specifically compare `/dragons/team` against the live legacy
   `https://hbdragons.de/dragons/team`: all four sections (Vorstand, Ehrenamtliche, Coaches, Refs)
   must be present with the same people.
5. Confirm the draft partner "SportCheck" does **not** appear on `/supporter`, and that no drafted
   collection leaks — the one check that proves D9/D11's filters are wired.

## Run order

1. `media` — everything else references it
2. `people`
3. `positions`, `vorstand`, `trainers`, `referees` — all depend on `people`
4. `teams` — depends on `trainers`
5. `partners`, `projects`, `downloads`, `shopItems`, `timelineItems`
6. `pages`
7. `posts` — depends on `media` for `headerImage`, `gallery` and inline images
8. globals

Each step holds a `Map<strapiId, payloadId>` in memory for the next.

## Human-in-the-loop

- ~~Create a full-access Strapi API token~~ — **done 2026-08-03.** Read from `STRAPI_TOKEN`, never
  committed. It was pasted into a chat transcript, so **revoke it in Strapi → Settings → API Tokens
  once the migration lands** rather than waiting for its 7-day expiry.
- ~~Remove the `.docx` upload~~ — **done 2026-08-03** (D10), library now 73 files.
- Declare the content freeze on Strapi before the real run.
- Review the migrated content in the Payload admin, then browse `site.testing.hbdragons.de`.

A note on how the admin was recovered, since it will matter again at cutover: `config/plugins.ts`
configures no email provider, so Strapi's admin password-reset mail can never send. Recovery is
`strapi admin:reset-user-password` (or `admin:create-user`) run inside the container.

## Out of scope

Filed as follow-ups rather than absorbed here:

- `en` locale content (D5) — needs Payload localization, its own ticket.
- Removing the site's now-dead `supporter`→`partner` fallback in `publishedPage`. `team`→`kontakt`
  stays load-bearing by design (D8).
- Issue #136 (Dependency Audit timeout) making `deploy.yml` silently skip. `deploy-site.yml` is not
  gated on CI so site rebuilds still work, but publish-triggered rebuilds are unreliable until it is
  fixed.
- Direct-GCS media URLs (`CMS_MEDIA_PUBLIC=true`) need a GCP org policy exception. Not blocking:
  media URLs are computed on read, so flipping it later needs no data migration.
