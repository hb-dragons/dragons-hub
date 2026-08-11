import { describe, expect, it } from "vitest";

import { event, newsArticle, serializeJsonLd, sportsOrganization, sportsTeam } from "./jsonld";

describe("sportsOrganization", () => {
  const org = sportsOrganization({
    url: "https://hbdragons.de/",
    logo: "https://hbdragons.de/img/logo.svg",
  });

  it("carries the required schema.org fields", () => {
    expect(org["@context"]).toBe("https://schema.org");
    expect(org["@type"]).toBe("SportsOrganization");
    expect(org.name).toBe("HB Dragons e.V.");
    expect(org.url).toBe("https://hbdragons.de/");
    expect(org.logo).toBe("https://hbdragons.de/img/logo.svg");
    expect(org.sport).toBe("Basketball");
  });

  it("links the official club profiles via sameAs", () => {
    expect(org.sameAs).toEqual(
      expect.arrayContaining([expect.stringContaining("instagram.com")]),
    );
  });

  it("names the registered club as alternateName", () => {
    expect(org.alternateName).toBe("Hanover Basketball Dragons e.V.");
  });
});

describe("sportsTeam", () => {
  it("carries the required schema.org fields", () => {
    const team = sportsTeam({ name: "Herren 1", url: "https://hbdragons.de/teams/herren-1/" });
    expect(team["@context"]).toBe("https://schema.org");
    expect(team["@type"]).toBe("SportsTeam");
    expect(team.name).toBe("Herren 1");
    expect(team.sport).toBe("Basketball");
    expect(team.url).toBe("https://hbdragons.de/teams/herren-1/");
    expect(team.memberOf).toEqual({ "@type": "SportsOrganization", name: "HB Dragons e.V." });
  });

  it("includes image and coach when present", () => {
    const team = sportsTeam({
      name: "Damen 1",
      url: "https://hbdragons.de/teams/damen-1/",
      image: "https://cms.hbdragons.de/media/damen-1.webp",
      coachName: "Alex Beispiel",
    });
    expect(team.image).toBe("https://cms.hbdragons.de/media/damen-1.webp");
    expect(team.coach).toEqual({ "@type": "Person", name: "Alex Beispiel" });
  });

  it("omits image and coach when absent", () => {
    const team = sportsTeam({ name: "U14", url: "https://hbdragons.de/teams/u14/" });
    expect(team).not.toHaveProperty("image");
    expect(team).not.toHaveProperty("coach");
  });
});

describe("newsArticle", () => {
  const published = new Date("2026-05-04T10:00:00.000Z");

  it("carries the required schema.org fields", () => {
    const article = newsArticle({
      headline: "Derbysieg für die Dragons",
      datePublished: published,
      url: "https://hbdragons.de/news/derbysieg/",
    });
    expect(article["@context"]).toBe("https://schema.org");
    expect(article["@type"]).toBe("NewsArticle");
    expect(article.headline).toBe("Derbysieg für die Dragons");
    expect(article.datePublished).toBe("2026-05-04T10:00:00.000Z");
    expect(article.url).toBe("https://hbdragons.de/news/derbysieg/");
    expect(article.mainEntityOfPage).toBe("https://hbdragons.de/news/derbysieg/");
    expect(article.publisher).toEqual({
      "@type": "SportsOrganization",
      name: "HB Dragons e.V.",
    });
  });

  it("includes image and description when present", () => {
    const article = newsArticle({
      headline: "Saisonstart",
      datePublished: published,
      url: "https://hbdragons.de/news/saisonstart/",
      image: "https://cms.hbdragons.de/media/header.webp",
      description: "Die Dragons starten in die neue Saison.",
    });
    expect(article.image).toEqual(["https://cms.hbdragons.de/media/header.webp"]);
    expect(article.description).toBe("Die Dragons starten in die neue Saison.");
  });

  it("omits image and description when absent", () => {
    const article = newsArticle({
      headline: "Saisonstart",
      datePublished: published,
      url: "https://hbdragons.de/news/saisonstart/",
      image: null,
      description: "",
    });
    expect(article).not.toHaveProperty("image");
    expect(article).not.toHaveProperty("description");
  });
});

describe("event", () => {
  const match = {
    kickoffDate: "2026-01-15",
    kickoffTime: "19:30:00",
    homeTeamName: "HB Dragons",
    guestTeamName: "TK Hannover",
    venueName: "IGS Roderbruch",
    venueNameOverride: null,
    venueStreet: "Rotekreuzstraße 23",
    venuePostalCode: "30627",
    venueCity: "Hannover",
  };

  it("carries the required schema.org fields", () => {
    const ld = event(match);
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("SportsEvent");
    expect(ld.name).toBe("HB Dragons – TK Hannover");
    expect(ld.sport).toBe("Basketball");
    expect(ld.homeTeam).toEqual({ "@type": "SportsTeam", name: "HB Dragons" });
    expect(ld.awayTeam).toEqual({ "@type": "SportsTeam", name: "TK Hannover" });
  });

  it("emits the kickoff with the club zone's winter offset", () => {
    expect(event(match).startDate).toBe("2026-01-15T19:30:00+01:00");
  });

  it("emits the kickoff with the club zone's summer offset", () => {
    const summer = { ...match, kickoffDate: "2026-07-15" };
    expect(event(summer).startDate).toBe("2026-07-15T19:30:00+02:00");
  });

  it("falls back to a naive timestamp for an impossible calendar day", () => {
    const invalid = { ...match, kickoffDate: "2026-02-30" };
    expect(event(invalid).startDate).toBe("2026-02-30T19:30:00");
  });

  it("builds the venue as a schema.org Place with a postal address", () => {
    expect(event(match).location).toEqual({
      "@type": "Place",
      name: "IGS Roderbruch",
      address: {
        "@type": "PostalAddress",
        streetAddress: "Rotekreuzstraße 23",
        postalCode: "30627",
        addressLocality: "Hannover",
        addressCountry: "DE",
      },
    });
  });

  it("prefers the venue name override over the federation name", () => {
    const overridden = { ...match, venueNameOverride: "Dragons Dome" };
    expect((event(overridden).location as { name: string }).name).toBe("Dragons Dome");
  });

  it("omits the address when no address fields are set", () => {
    const bare = { ...match, venueStreet: null, venuePostalCode: null, venueCity: null };
    expect(event(bare).location).toEqual({ "@type": "Place", name: "IGS Roderbruch" });
  });

  it("omits the location entirely without a venue name", () => {
    const noVenue = { ...match, venueName: null, venueNameOverride: null };
    expect(event(noVenue)).not.toHaveProperty("location");
  });

  it("treats an empty venue name like a missing one", () => {
    const blank = { ...match, venueName: "", venueNameOverride: null };
    expect(event(blank)).not.toHaveProperty("location");
  });

  it("keeps partial addresses to the fields that exist", () => {
    const partial = { ...match, venueStreet: null };
    expect(event(partial).location).toEqual({
      "@type": "Place",
      name: "IGS Roderbruch",
      address: {
        "@type": "PostalAddress",
        postalCode: "30627",
        addressLocality: "Hannover",
        addressCountry: "DE",
      },
    });
  });
});

describe("serializeJsonLd", () => {
  it("serializes an object to JSON", () => {
    expect(serializeJsonLd({ "@type": "SportsEvent" })).toBe('{"@type":"SportsEvent"}');
  });

  it("escapes angle brackets so a </script> in content cannot break out", () => {
    const json = serializeJsonLd({ headline: "</script><script>alert(1)</script>" });
    expect(json).not.toContain("</script>");
    expect(json).toContain("\\u003c/script>");
  });

  it("serializes arrays of objects (one script tag, many events)", () => {
    const json = serializeJsonLd([{ "@type": "SportsEvent" }, { "@type": "SportsEvent" }]);
    expect(JSON.parse(json)).toHaveLength(2);
  });
});
