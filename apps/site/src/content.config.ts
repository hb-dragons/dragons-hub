/**
 * Astro collections for every CMS type the site renders. Schemas are narrow on
 * purpose — exactly the fields the site consumes, no passthrough — so a CMS
 * field rename fails the build loudly at sync time instead of shipping pages
 * with holes (the contract is pinned CMS-side by
 * apps/cms/src/collections/content-contract.test.ts).
 *
 * Relationship depth per collection is chosen so every media/person field the
 * site renders arrives populated (Payload returns bare ids past the requested
 * depth): e.g. teams needs depth 3 for teams → trainers → person → image.
 */
import { defineCollection } from "astro:content";
import { z } from "astro/zod";

import { payloadLoader } from "./lib/payload";

/** Populated `media` upload relation (BlurImage consumes url + blurhash). */
const media = z.object({
  id: z.number(),
  alt: z.string().nullish(),
  blurhash: z.string().nullish(),
  url: z.string().nullish(),
  filename: z.string().nullish(),
  mimeType: z.string().nullish(),
  filesize: z.number().nullish(),
  width: z.number().nullish(),
  height: z.number().nullish(),
});

/** Lexical editor state. `root` stays opaque — @payloadcms/richtext-lexical's
 * HTML converter owns that shape; validating it here would strip node keys. */
const lexical = z.object({ root: z.record(z.string(), z.unknown()) });

/** Drafted collections carry `_status`; pages filter on it because the build
 * user's API key sees drafts too (`publishedOrAuthed` read access). */
const status = z.enum(["draft", "published"]).nullish();

const person = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  image: media.nullish(),
});

const trainer = z.object({
  id: z.number(),
  person: person.nullish(),
  licence: z.string().nullish(),
  email: z.string().nullish(),
  image: media.nullish(),
});

const trainingTime = z.object({
  day: z.string(),
  startTime: z.string(),
  endTime: z.string().nullish(),
  gym: z.string(),
  gymMapsUrl: z.string().nullish(),
  info: z.string().nullish(),
});

const post = z.object({
  id: z.number(),
  title: z.string(),
  slug: z.string(),
  publishedDate: z.coerce.date(),
  headerImage: media.nullish(),
  content: lexical.nullish(),
  gallery: z.array(media).nullish(),
  seoDescription: z.string().nullish(),
  ogImage: media.nullish(),
  _status: status,
});

// Relations inside page layout blocks are populated one level deep (pages use
// depth 1), so their own uploads are past the depth budget. Blocks carry ids +
// display fields; pages join the full collections for anything richer.
const pageBlock = z.discriminatedUnion("blockType", [
  z.object({
    blockType: z.literal("teamList"),
    teams: z.array(z.object({ id: z.number(), name: z.string(), slug: z.string() })).nullish(),
  }),
  z.object({
    blockType: z.literal("contact"),
    vorstand: z.array(z.object({ id: z.number(), role: z.string(), orderIndex: z.number() })).nullish(),
    positions: z.array(z.object({ id: z.number(), name: z.string(), orderIndex: z.number() })).nullish(),
  }),
  z.object({
    blockType: z.literal("newsList"),
    posts: z
      .array(z.object({ id: z.number(), title: z.string(), slug: z.string(), publishedDate: z.coerce.date() }))
      .nullish(),
  }),
  z.object({
    blockType: z.literal("downloadList"),
    downloads: z
      .array(z.object({ id: z.number(), title: z.string(), category: z.string().nullish() }))
      .nullish(),
  }),
]);

const page = z.object({
  id: z.number(),
  slug: z.string(),
  header: z.object({ title: z.string().nullish(), image: media.nullish() }).nullish(),
  layout: z.array(pageBlock).nullish(),
  seoDescription: z.string().nullish(),
  ogImage: media.nullish(),
  _status: status,
});

const team = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  orderIndex: z.number(),
  teamImage: media.nullish(),
  apiTeamPermanentId: z.number().nullish(),
  trainers: z.array(trainer).nullish(),
  trainingTimes: z.array(trainingTime).nullish(),
  seoDescription: z.string().nullish(),
  ogImage: media.nullish(),
});

export const collections = {
  posts: defineCollection({
    loader: payloadLoader("posts", { sort: "-publishedDate" }),
    schema: post,
  }),
  pages: defineCollection({
    loader: payloadLoader("pages"),
    schema: page,
  }),
  teams: defineCollection({
    loader: payloadLoader("teams", { depth: 3, sort: "orderIndex" }),
    schema: team,
  }),
  partners: defineCollection({
    loader: payloadLoader("partners", { sort: "orderIndex" }),
    schema: z.object({
      id: z.number(),
      name: z.string(),
      logo: media.nullish(),
      url: z.string().nullish(),
      orderIndex: z.number().nullish(),
    }),
  }),
  projects: defineCollection({
    loader: payloadLoader("projects"),
    schema: z.object({
      id: z.number(),
      title: z.string(),
      description: z.string().nullish(),
      image: media.nullish(),
      link: z.string().nullish(),
    }),
  }),
  downloads: defineCollection({
    loader: payloadLoader("downloads"),
    schema: z.object({
      id: z.number(),
      title: z.string(),
      file: media.nullish(),
      category: z.string().nullish(),
    }),
  }),
  shopItems: defineCollection({
    loader: payloadLoader("shop-items"),
    schema: z.object({
      id: z.number(),
      name: z.string(),
      image: media.nullish(),
      price: z.string().nullish(),
      link: z.string().nullish(),
      description: z.string().nullish(),
    }),
  }),
  timelineItems: defineCollection({
    loader: payloadLoader("timeline-items"),
    schema: z.object({
      id: z.number(),
      year: z.string().nullish(),
      title: z.string(),
      description: z.string().nullish(),
      image: media.nullish(),
    }),
  }),
  people: defineCollection({
    loader: payloadLoader("people"),
    schema: person,
  }),
  vorstand: defineCollection({
    // depth 2: vorstand → person → person.image populated.
    loader: payloadLoader("vorstand", { depth: 2, sort: "orderIndex" }),
    schema: z.object({
      id: z.number(),
      role: z.string(),
      tasks: z.string().nullish(),
      person: person.nullish(),
      orderIndex: z.number(),
      image: media.nullish(),
    }),
  }),
  positions: defineCollection({
    // depth 2: positions → people → person.image populated.
    loader: payloadLoader("positions", { depth: 2, sort: "orderIndex" }),
    schema: z.object({
      id: z.number(),
      name: z.string(),
      tasks: z.string().nullish(),
      people: z.array(person).nullish(),
      orderIndex: z.number(),
      email: z.string().nullish(),
    }),
  }),
  trainers: defineCollection({
    // depth 2: trainers → person → person.image populated.
    loader: payloadLoader("trainers", { depth: 2 }),
    schema: trainer,
  }),
};
