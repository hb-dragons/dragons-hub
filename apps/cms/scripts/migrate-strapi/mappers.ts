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
    // Strapi team.trainer is oneToOne (schema.json), so it arrives as a single
    // object or null — never an array — same shape as position.ehrenamtliche
    // below. Wrap it before rels() so a real team with a coach doesn't crash.
    trainers: rels(doc.trainer == null ? [] : [doc.trainer], ids.trainers),
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
