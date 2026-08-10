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
  reconcilePartnerStatuses,
  resolvePostSlug,
  type IdMaps,
} from "./mappers";
import { migrateMedia } from "./media";
import { countDocs, createDoc, deleteAll, getGlobal, updateGlobal } from "./payload-client";
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

/**
 * The two globals (team-background.image, background-video.video) are
 * write-only below — every wiped-and-refilled collection gets a Strapi-count
 * vs Payload-count row for free (deleteAll then countDocs), but a global is
 * never wiped, so nothing naturally proves the media id it holds survived
 * the trip. Read it back at depth=0 (a populated relation arrives as a bare
 * id, not an object) and report presence, not the id itself: a Strapi
 * upload id and a Payload upload id are different numbering spaces, so
 * asserting they're "equal" would be meaningless — but "Payload has one
 * whenever Strapi did" is exactly the invariant a media.get() miss, a
 * quietly-skipped write (fetchSingle returning null), or an unreported
 * Strapi-side clear would otherwise break without a trace.
 */
async function globalMediaPresence(slug: string, field: string): Promise<number> {
  const doc = await getGlobal(slug);
  const value = doc[field] as number | { id: number } | null | undefined;
  return value === null || value === undefined ? 0 : 1;
}

// team.training is a component holding a `gym` relation (see mappers.ts's
// StrapiTraining); Strapi's populate=* does not reach a relation nested
// inside a component, so training[].gym comes back null without this. The
// two sibling top-level fields (teamImage, trainer) that populate=* would
// otherwise cover have to be re-listed here too — a bare deep-populate
// object replaces populate=* entirely rather than adding to it (see
// buildStrapiUrl), and the /api/teams route runs Strapi's plain default
// controller with no populate merging of its own to fall back on.
const TEAMS_POPULATE = {
  "populate[training][populate]": "*",
  "populate[teamImage]": "true",
  "populate[trainer]": "true",
};

// page-header (posts.header, pages.header) holds its `image` the same way —
// nested inside a component, unreached by populate=*. Unlike teams, the
// /api/posts route runs a custom controller that already force-populates
// `gallery` by default whenever the request's populate is an object rather
// than the bare string "*" (see dragons-cms/src/api/post/controllers/post.ts)
// — verified live 2026-08-03 — but that default is undocumented from this
// side of the fence, so gallery is asked for explicitly here rather than
// relying on it.
const POSTS_POPULATE = {
  "populate[header][populate]": "*",
  "populate[gallery]": "true",
};

const PAGES_POPULATE = {
  "populate[header][populate]": "*",
};

export async function main(): Promise<void> {
  // Preflight: a team added in Strapi since the map was written would migrate
  // with a null join key and silently lose its live standings. Fail instead.
  const strapiTeams = await fetchAll("teams", TEAMS_POPULATE);
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

  // Partners are the one collection with an unpublished document
  // (SportCheck), so they are read with status=draft to see it too. Strapi 5
  // does return the draft version of every document on that fetch, and the
  // *content* of a published one is identical either way — but publishedAt is
  // not: status=draft sets it to null on every document, published ones
  // included. mapPartner can't derive _status from a field the fetch itself
  // blanks out, so reconcile against a second, status=published fetch via
  // reconcilePartnerStatuses (mappers.ts) instead of deriving it here.
  // Sorted by id ascending so the orderIndex mapPartner assigns (run()'s loop
  // counter) is deterministic across runs, matching mapPartner's own comment
  // on orderIndex — fetchAll sends no `sort`, and the live API does not
  // return partners in id order (verified 2026-08-03: the draft fetch
  // returned ids 13, 15, 10, 1 in that order).
  const strapiPartnersDraft = (await fetchAll("partners", { status: "draft" })).sort(
    (a, b) => a.id - b.id,
  );
  const partnerStatuses = reconcilePartnerStatuses(
    strapiPartnersDraft,
    await fetchAll("partners"),
  );
  await run("partners", strapiPartnersDraft, (doc, index) =>
    mapPartner(doc, ids, index, partnerStatuses.get(doc.id) ?? "draft"),
  );

  await run("projects", await fetchAll("projects"), (doc) => mapProject(doc, ids));
  await run("downloads", await fetchAll("downloads"), (doc) => mapDownload(doc, ids));
  await run("shop-items", await fetchAll("shop-items"), (doc) => mapShopItem(doc, ids));
  await run("timeline-items", await fetchAll("timeline-items"), (doc) =>
    mapTimelineItem(doc, ids),
  );

  const strapiPages = await fetchAll("pages", PAGES_POPULATE);
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

  const strapiPosts = await fetchAll("posts", POSTS_POPULATE);
  await run("posts", strapiPosts, async (doc) =>
    mapPost(
      doc,
      ids,
      // resolvePostSlug, not doc.slug: one real post has none, and a warning
      // labelled "(no slug)" would not tell an operator which post to open.
      await strapiBlocksToLexical(
        (doc.content ?? []) as StrapiBlock[],
        media,
        resolvePostSlug(doc).slug,
      ),
    ),
  );

  console.log("globals");
  const teamBackground = await fetchSingle("team-background");
  // Kept outside the `if` below (unlike `image` itself) because the
  // verification step needs to know whether Strapi had one even when the
  // document is missing entirely and the write is skipped.
  const teamBackgroundImage = (teamBackground?.image as { id: number } | null) ?? null;
  if (teamBackground !== null) {
    // The document can exist with its image field cleared — an editor
    // unsetting it is not an error, and must not abort a run that has
    // already wiped and refilled all fourteen collections.
    await updateGlobal("team-background", {
      image: teamBackgroundImage === null ? null : (media.get(teamBackgroundImage.id) ?? null),
    });
  }
  const backgroundVideo = await fetchSingle("background-video");
  const backgroundVideoVideo = (backgroundVideo?.video as { id: number } | null) ?? null;
  if (backgroundVideo !== null) {
    // Same as above: a cleared video field is not an error.
    await updateGlobal("background-video", {
      video: backgroundVideoVideo === null ? null : (media.get(backgroundVideoVideo.id) ?? null),
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

  // want/got below are presence flags (1/0), not counts — see
  // globalMediaPresence's doc comment for why a global can't be compared the
  // same way a collection count is.
  const globalMediaChecks: [slug: string, field: string, strapiHadOne: boolean][] = [
    ["team-background", "image", teamBackgroundImage !== null],
    ["background-video", "video", backgroundVideoVideo !== null],
  ];
  for (const [slug, field, strapiHadOne] of globalMediaChecks) {
    const want = strapiHadOne ? 1 : 0;
    const got = await globalMediaPresence(slug, field);
    counts.push([slug, want, got]);
    if (got !== want) failed = true;
  }

  for (const [collection, want, got] of counts) {
    console.log(`  ${collection.padEnd(16)} strapi=${String(want).padEnd(4)} payload=${got}${got === want ? "" : "   MISMATCH"}`);
  }

  // What was actually written: strapiPages run through the same slug mapping
  // mapPage uses, not the static PAGE_SLUGS table — a production run where
  // Strapi returned fewer pages than the table lists would otherwise print
  // all six regardless, which is exactly the output an operator reads to
  // sanity-check the run.
  const slugsWritten = strapiPages.map((doc) => PAGE_SLUGS[doc.slug as string] ?? (doc.slug as string));
  console.log(`  page slugs: ${slugsWritten.join(", ")}, ${SEEDED_PAGES.map((p) => p.slug).join(", ")}`);

  if (failed) {
    console.error("\nFAILED: counts do not match");
    process.exit(1);
  }
  console.log("\nOK");
}

