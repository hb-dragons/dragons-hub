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
