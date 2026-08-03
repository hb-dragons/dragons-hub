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

async function main(): Promise<void> {
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
  // blanks out, so reconcile against a second, status=published fetch
  // instead. documentId is the join key — id is not stable across the two
  // (Strapi rewrites it per status; verified live 2026-08-03, e.g. Menbun is
  // id 16 published and id 15 draft) — and the reconciled status is passed
  // into mapPartner explicitly.
  const strapiPartnersDraft = await fetchAll("partners", { status: "draft" });
  const publishedPartnerDocumentIds = new Set(
    (await fetchAll("partners")).map((doc) => doc.documentId),
  );
  await run("partners", strapiPartnersDraft, (doc, index) =>
    mapPartner(
      doc,
      ids,
      index,
      publishedPartnerDocumentIds.has(doc.documentId) ? "published" : "draft",
    ),
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
    mapPost(doc, ids, await strapiBlocksToLexical((doc.content ?? []) as StrapiBlock[], media)),
  );

  console.log("globals");
  const teamBackground = await fetchSingle("team-background");
  if (teamBackground !== null) {
    // The document can exist with its image field cleared — an editor
    // unsetting it is not an error, and must not abort a run that has
    // already wiped and refilled all fourteen collections.
    const image = teamBackground.image as { id: number } | null;
    await updateGlobal("team-background", {
      image: image === null ? null : (media.get(image.id) ?? null),
    });
  }
  const backgroundVideo = await fetchSingle("background-video");
  if (backgroundVideo !== null) {
    // Same as above: a cleared video field is not an error.
    const video = backgroundVideo.video as { id: number } | null;
    await updateGlobal("background-video", {
      video: video === null ? null : (media.get(video.id) ?? null),
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
