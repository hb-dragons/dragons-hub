import { describe, expect, it, vi } from "vitest";

import {
  PAGE_SLUGS,
  SEEDED_PAGES,
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

describe("mapPerson", () => {
  it("carries contact fields and resolves the image via the media map", () => {
    expect(
      mapPerson(
        {
          id: 4,
          documentId: "per1",
          publishedAt: "2025-01-01T00:00:00.000Z",
          name: "Jane Doe",
          email: "jane@example.com",
          phone: "0123456789",
          image: { id: 9 },
        },
        { media: new Map([[9, 900]]) },
      ),
    ).toMatchObject({
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "0123456789",
      image: 900,
    });
  });

  it("leaves image null when the person has none", () => {
    expect(
      mapPerson(
        {
          id: 5,
          documentId: "per2",
          publishedAt: "2025-01-01T00:00:00.000Z",
          name: "No Photo",
          image: null,
        },
        ids,
      ).image,
    ).toBeNull();
  });
});

describe("mapPosition", () => {
  it("wraps the single ehrenamtliche relation and resolves it through the people map", () => {
    expect(
      mapPosition(
        {
          id: 21,
          documentId: "pos1",
          publishedAt: "2025-01-01T00:00:00.000Z",
          name: "Kassenwart",
          tasks: "Finanzen",
          email: "kasse@example.com",
          orderIndex: 2,
          // Strapi position.ehrenamtliche is oneToOne — a single object, not an array.
          ehrenamtliche: { id: 6 },
        },
        { people: new Map([[6, 600]]) },
      ),
    ).toMatchObject({
      name: "Kassenwart",
      tasks: "Finanzen",
      email: "kasse@example.com",
      orderIndex: 2,
      people: [600],
      _status: "published",
    });
  });

  it("maps to an empty people array when ehrenamtliche is null", () => {
    expect(
      mapPosition(
        {
          id: 22,
          documentId: "pos2",
          publishedAt: null,
          name: "Beisitzer",
          ehrenamtliche: null,
        },
        ids,
      ),
    ).toMatchObject({ people: [], _status: "draft" });
  });
});

describe("mapVorstand", () => {
  it("reads the role title from name and resolves person and image", () => {
    expect(
      mapVorstand(
        {
          id: 40,
          documentId: "v1",
          publishedAt: "2025-01-01T00:00:00.000Z",
          name: "1. Vorsitzende",
          tasks: "Vereinsleitung",
          orderIndex: 0,
          ehrenamtliche: { id: 6 },
          image: { id: 9 },
        },
        { people: new Map([[6, 600]]), media: new Map([[9, 900]]) },
      ),
    ).toMatchObject({
      role: "1. Vorsitzende",
      tasks: "Vereinsleitung",
      orderIndex: 0,
      person: 600,
      image: 900,
      _status: "published",
    });
  });

  it("leaves person and image null when Strapi has neither", () => {
    expect(
      mapVorstand(
        {
          id: 41,
          documentId: "v2",
          publishedAt: null,
          name: "Schriftführer",
          ehrenamtliche: null,
          image: null,
        },
        ids,
      ),
    ).toMatchObject({ person: null, image: null, _status: "draft" });
  });
});

describe("mapTrainer", () => {
  it("renames lizenz to licence and resolves person and image", () => {
    expect(
      mapTrainer(
        {
          id: 8,
          documentId: "tr1",
          publishedAt: "2025-01-01T00:00:00.000Z",
          ehrenamtliche: { id: 6 },
          lizenz: "B-Lizenz",
          email: "trainer@example.com",
          image: { id: 9 },
        },
        { people: new Map([[6, 600]]), media: new Map([[9, 900]]) },
      ),
    ).toMatchObject({
      person: 600,
      licence: "B-Lizenz",
      email: "trainer@example.com",
      image: 900,
    });
  });

  it("leaves person null when the trainer has no ehrenamtliche relation", () => {
    expect(
      mapTrainer(
        {
          id: 9,
          documentId: "tr2",
          publishedAt: "2025-01-01T00:00:00.000Z",
          ehrenamtliche: null,
        },
        ids,
      ).person,
    ).toBeNull();
  });
});

describe("mapReferee", () => {
  it("renames lizenz to licence and resolves person and image", () => {
    expect(
      mapReferee(
        {
          id: 12,
          documentId: "ref1",
          publishedAt: "2025-01-01T00:00:00.000Z",
          ehrenamtliche: { id: 6 },
          lizenz: "Landesliga",
          image: { id: 9 },
        },
        { people: new Map([[6, 600]]), media: new Map([[9, 900]]) },
      ),
    ).toMatchObject({ person: 600, licence: "Landesliga", image: 900, _status: "published" });
  });

  it("maps the unpublished referee to a draft", () => {
    expect(
      mapReferee(
        { id: 13, documentId: "ref2", publishedAt: null, ehrenamtliche: null },
        ids,
      )._status,
    ).toBe("draft");
  });
});

describe("mapTeam", () => {
  // The real shape of a Strapi team.training row under a deep populate
  // (verified against the live API 2026-08-03) — gym is the related gym
  // object, not a string, and Strapi's time fields carry seconds.
  const goetheschuleRow = {
    id: 86,
    day: "Mittwoch",
    startTime: "20:00:00",
    endTime: "22:00:00",
    info: "Segment 2",
    gym: {
      id: 2,
      documentId: "ca7d5y3ec33r1k6y61e0w18c",
      name: "GY Goetheschule",
      location: {
        address: "Haltenhoffstraße 97, 30167 Hannover, Deutschland",
        geohash: "u1qfhfhj4rtf",
        coordinates: { lat: 52.3946978, lng: 9.706525200000002 },
      },
    },
  };

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
      // Strapi team.trainer is oneToOne — a single object, never an array.
      trainer: { id: 8 },
      training: [goetheschuleRow],
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
        day: "Mittwoch",
        startTime: "20:00:00",
        endTime: "22:00:00",
        // The gym relation's name, not the relation object itself.
        gym: "GY Goetheschule",
        gymMapsUrl: null,
        info: "Segment 2",
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
      // A team with no coach: Strapi's oneToOne relation is null, not [].
      trainer: null,
      training: null,
    };
    expect(mapTeam(doc, ids).teamImage).toBeNull();
    expect(mapTeam(doc, ids).trainingTimes).toEqual([]);
  });

  // Payload's trainingTimes requires day, startTime and gym, but none of the
  // three is `required: true` on Strapi's team.training component — any one
  // of them can arrive unset. A row missing any one is dropped and warned
  // about rather than aborting the whole run the way an untranslated gym
  // relation used to.
  it.each([
    [
      "gym",
      { id: 90, day: "Montag", startTime: "18:00:00", endTime: "20:00:00", info: null, gym: null },
      'mapTeam: team "u18" — training row (day="Montag") missing gym, dropping it',
    ],
    [
      "day",
      {
        id: 91,
        day: null,
        startTime: "18:00:00",
        endTime: "20:00:00",
        info: null,
        gym: goetheschuleRow.gym,
      },
      'mapTeam: team "u18" — training row (day="null") missing day, dropping it',
    ],
    [
      "startTime",
      {
        id: 92,
        day: "Montag",
        startTime: null,
        endTime: "20:00:00",
        info: null,
        gym: goetheschuleRow.gym,
      },
      'mapTeam: team "u18" — training row (day="Montag") missing startTime, dropping it',
    ],
  ])("drops a training row missing %s and warns, keeping the other rows", (_field, badRow, warning) => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const doc = {
      id: 109,
      documentId: "z",
      publishedAt: "2025-01-01T00:00:00.000Z",
      name: "U18",
      slug: "u18",
      orderIndex: 8,
      teamImage: null,
      trainer: null,
      training: [badRow, goetheschuleRow],
    };
    const mapped = mapTeam(doc, ids);
    expect(mapped.trainingTimes).toEqual([
      {
        day: "Mittwoch",
        startTime: "20:00:00",
        endTime: "22:00:00",
        gym: "GY Goetheschule",
        gymMapsUrl: null,
        info: "Segment 2",
      },
    ]);
    expect(warnSpy).toHaveBeenCalledExactlyOnceWith(warning);
    warnSpy.mockRestore();
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

describe("mapProject", () => {
  it("renames name to title and logo to image", () => {
    expect(
      mapProject(
        {
          id: 50,
          documentId: "proj1",
          publishedAt: "2025-01-01T00:00:00.000Z",
          name: "Jugendförderung",
          beschreibung: "Text",
          logo: { id: 9 },
          link: "https://example.com",
        },
        { media: new Map([[9, 900]]) },
      ),
    ).toMatchObject({
      title: "Jugendförderung",
      description: "Text",
      image: 900,
      link: "https://example.com",
      _status: "published",
    });
  });

  it("leaves image null when the project has no logo", () => {
    expect(
      mapProject(
        { id: 51, documentId: "proj2", publishedAt: null, name: "Ohne Logo", logo: null },
        ids,
      ).image,
    ).toBeNull();
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
