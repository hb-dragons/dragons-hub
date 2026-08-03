// Field names here are the contract the site's build loaders (plan Task C3)
// and the Strapi migration script (Task A6) depend on — they mirror plan
// Task A3 verbatim. A failure means a breaking rename, not a broken test.
import type { CollectionConfig, Field, GlobalConfig } from "payload";
import { describe, expect, it } from "vitest";

import { anyone, publishedOrAuthed } from "../lib/access";
import { BackgroundVideo } from "../globals/background-video";
import { SiteSettings } from "../globals/site-settings";
import { TeamBackground } from "../globals/team-background";
import { Downloads } from "./downloads";
import { Pages } from "./pages";
import { Partners } from "./partners";
import { People } from "./people";
import { Positions } from "./positions";
import { Posts } from "./posts";
import { Projects } from "./projects";
import { Referees } from "./referees";
import { ShopItems } from "./shop-items";
import { Teams } from "./teams";
import { TimelineItems } from "./timeline-items";
import { Trainers } from "./trainers";
import { Vorstand } from "./vorstand";

const fieldNames = (fields: Field[]): string[] =>
  fields.map((field) => ("name" in field ? field.name : field.type));

const SEO_FIELDS = ["seoDescription", "ogImage"];

describe("drafted collections (posts, pages)", () => {
  it.each([
    { slug: "posts", collection: Posts },
    { slug: "pages", collection: Pages },
  ])("$slug has drafts on and publishedOrAuthed read access", ({ collection }) => {
    expect(collection.versions).toEqual({ drafts: true });
    expect(collection.access?.read).toBe(publishedOrAuthed);
  });

  it("posts carries the contracted fields", () => {
    expect(Posts.slug).toBe("posts");
    expect(fieldNames(Posts.fields)).toEqual([
      "title",
      "slug",
      "publishedDate",
      "headerImage",
      "content",
      "gallery",
      ...SEO_FIELDS,
    ]);
  });

  it("pages carries the contracted fields with the header group", () => {
    expect(Pages.slug).toBe("pages");
    expect(fieldNames(Pages.fields)).toEqual(["slug", "header", "layout", ...SEO_FIELDS]);
    const header = Pages.fields.find((f) => "name" in f && f.name === "header");
    expect(header && "fields" in header && fieldNames(header.fields)).toEqual(["title", "image"]);
  });

  it("pages layout blocks mirror the Strapi dynamic zone 1:1", () => {
    const layout = Pages.fields.find((f) => "name" in f && f.name === "layout");
    if (!layout || layout.type !== "blocks") throw new Error("layout blocks field missing");
    const blocks = Object.fromEntries(
      layout.blocks.map((block) => [block.slug, fieldNames(block.fields)]),
    );
    expect(blocks).toEqual({
      teamList: ["teams"],
      contact: ["vorstand", "positions"],
      newsList: ["posts"],
      downloadList: ["downloads"],
    });
  });
});

describe("teams", () => {
  it("carries the contracted fields incl. the apiTeamPermanentId join key", () => {
    expect(Teams.slug).toBe("teams");
    expect(Teams.versions).toBeUndefined();
    expect(Teams.access?.read).toBe(anyone);
    expect(fieldNames(Teams.fields)).toEqual([
      "name",
      "slug",
      "orderIndex",
      "teamImage",
      "apiTeamPermanentId",
      "trainers",
      "trainingTimes",
      ...SEO_FIELDS,
    ]);
  });

  it("trainingTimes rows mirror the Strapi team.training component", () => {
    const trainingTimes = Teams.fields.find((f) => "name" in f && f.name === "trainingTimes");
    expect(
      trainingTimes && "fields" in trainingTimes && fieldNames(trainingTimes.fields),
    ).toEqual(["day", "startTime", "endTime", "gym", "gymMapsUrl", "info"]);
  });

  it("keys are unique: slug and apiTeamPermanentId", () => {
    for (const name of ["slug", "apiTeamPermanentId"]) {
      const field = Teams.fields.find((f) => "name" in f && f.name === name);
      expect(field && "unique" in field && field.unique).toBe(true);
    }
  });
});

describe("people graph and flat collections", () => {
  const contracts: { slug: string; collection: CollectionConfig; fields: string[] }[] = [
    { slug: "people", collection: People, fields: ["name", "email", "phone", "image"] },
    { slug: "vorstand", collection: Vorstand, fields: ["role", "tasks", "person", "orderIndex", "image"] },
    { slug: "positions", collection: Positions, fields: ["name", "tasks", "people", "orderIndex", "email"] },
    { slug: "trainers", collection: Trainers, fields: ["person", "licence", "email", "image"] },
    { slug: "partners", collection: Partners, fields: ["name", "logo", "url", "orderIndex"] },
    { slug: "projects", collection: Projects, fields: ["title", "description", "image", "link"] },
    { slug: "downloads", collection: Downloads, fields: ["title", "file", "category"] },
    { slug: "shop-items", collection: ShopItems, fields: ["name", "image", "price", "link", "description"] },
    { slug: "timeline-items", collection: TimelineItems, fields: ["year", "title", "description", "image"] },
  ];

  it.each(contracts)(
    "$slug is publish-direct, world-readable, fields per contract",
    ({ collection, slug, fields }) => {
      expect(collection.slug).toBe(slug);
      expect(collection.versions).toBeUndefined();
      expect(collection.access?.read).toBe(anyone);
      expect(fieldNames(collection.fields)).toEqual(fields);
    },
  );
});

describe("referees", () => {
  it("carries the contracted fields", () => {
    expect(Referees.slug).toBe("referees");
    expect(fieldNames(Referees.fields)).toEqual(["person", "licence", "image"]);
  });
});

describe("globals", () => {
  const contracts: { slug: string; global: GlobalConfig; fields: string[] }[] = [
    { slug: "site-settings", global: SiteSettings, fields: ["memberCount", "foundingYear"] },
    { slug: "team-background", global: TeamBackground, fields: ["image"] },
    { slug: "background-video", global: BackgroundVideo, fields: ["video"] },
  ];

  it.each(contracts)(
    "$slug is world-readable with the contracted fields",
    ({ global, slug, fields }) => {
      expect(global.slug).toBe(slug);
      expect(global.access?.read).toBe(anyone);
      expect(fieldNames(global.fields)).toEqual(fields);
    },
  );
});
