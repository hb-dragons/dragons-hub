/**
 * schema.org JSON-LD builders (plan Task C8): SportsOrganization on home,
 * SportsTeam on team detail, NewsArticle on news detail, SportsEvent on the
 * Spielplan. Hand-rolled objects — no dependency, unit-tested for the
 * required schema.org fields. Serialize with {@link serializeJsonLd} into a
 * single `<script type="application/ld+json">` per page (Seo.astro).
 */
import { CLUB_TIME_ZONE, clubDayAnchor } from "@dragons/shared";

import { SOCIAL_LINKS } from "./site-assets";
import { strings } from "./strings";

export type JsonLd = Record<string, unknown>;

const SCHEMA_ORG = "https://schema.org";
const SPORT = "Basketball";

/** Home page: the club itself. */
export function sportsOrganization(opts: { url: string; logo: string }): JsonLd {
  return {
    "@context": SCHEMA_ORG,
    "@type": "SportsOrganization",
    name: strings.site.name,
    alternateName: strings.footer.clubName,
    url: opts.url,
    logo: opts.logo,
    sport: SPORT,
    // The Vereinsanschrift from the Impressum: local search needs a place, not
    // just a name, to surface the club for "basketball hannover" queries.
    address: {
      "@type": "PostalAddress",
      streetAddress: strings.site.address.street,
      postalCode: strings.site.address.postalCode,
      addressLocality: strings.site.address.city,
      addressCountry: strings.site.address.country,
    },
    email: strings.footer.email,
    sameAs: Object.values(SOCIAL_LINKS),
  };
}

export interface SportsTeamInput {
  name: string;
  url: string;
  image?: string | null | undefined;
  coachName?: string | null | undefined;
}

/** Team detail page: one club team, member of the organization. */
export function sportsTeam(team: SportsTeamInput): JsonLd {
  const result: JsonLd = {
    "@context": SCHEMA_ORG,
    "@type": "SportsTeam",
    name: team.name,
    sport: SPORT,
    url: team.url,
    memberOf: { "@type": "SportsOrganization", name: strings.site.name },
  };
  if (team.image != null) result.image = team.image;
  if (team.coachName != null) result.coach = { "@type": "Person", name: team.coachName };
  return result;
}

export interface NewsArticleInput {
  headline: string;
  datePublished: Date;
  url: string;
  image?: string | null | undefined;
  description?: string | null | undefined;
}

/** News detail page. */
export function newsArticle(post: NewsArticleInput): JsonLd {
  const result: JsonLd = {
    "@context": SCHEMA_ORG,
    "@type": "NewsArticle",
    headline: post.headline,
    datePublished: post.datePublished.toISOString(),
    url: post.url,
    mainEntityOfPage: post.url,
    publisher: { "@type": "SportsOrganization", name: strings.site.name },
  };
  if (post.image != null) result.image = [post.image];
  if (post.description != null && post.description !== "") {
    result.description = post.description;
  }
  return result;
}

/** The MatchListItem slice the Spielplan events render (spielplan-events.ts). */
export interface EventMatchInput {
  /** Club calendar day, `YYYY-MM-DD`. */
  kickoffDate: string;
  /** Club wall-clock time, `HH:MM:SS`. */
  kickoffTime: string;
  homeTeamName: string;
  guestTeamName: string;
  venueName?: string | null | undefined;
  venueNameOverride?: string | null | undefined;
  venueStreet?: string | null | undefined;
  venuePostalCode?: string | null | undefined;
  venueCity?: string | null | undefined;
}

const OFFSET_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: CLUB_TIME_ZONE,
  timeZoneName: "longOffset",
});

/**
 * Kickoff as ISO 8601 with the club zone's UTC offset on that day ("longOffset"
 * yields `GMT+02:00`). The noon day-anchor picks the right side of a DST
 * switch (games never tip off around 2–3 a.m.). An impossible calendar day
 * degrades to the naive local timestamp instead of throwing.
 */
function kickoffIso(date: string, time: string): string {
  const anchor = clubDayAnchor(date);
  if (Number.isNaN(anchor.getTime())) return `${date}T${time}`;
  const zone = OFFSET_FMT.formatToParts(anchor).find((part) => part.type === "timeZoneName");
  return `${date}T${time}${zone === undefined ? "" : zone.value.replace("GMT", "")}`;
}

function eventLocation(match: EventMatchInput): JsonLd | null {
  const name = match.venueNameOverride ?? match.venueName;
  if (name == null || name === "") return null;
  const location: JsonLd = { "@type": "Place", name };
  const hasAddress =
    match.venueStreet != null || match.venuePostalCode != null || match.venueCity != null;
  if (!hasAddress) return location;
  const address: JsonLd = { "@type": "PostalAddress" };
  if (match.venueStreet != null) address.streetAddress = match.venueStreet;
  if (match.venuePostalCode != null) address.postalCode = match.venuePostalCode;
  if (match.venueCity != null) address.addressLocality = match.venueCity;
  address.addressCountry = "DE";
  location.address = address;
  return location;
}

/** Spielplan: one upcoming match as a schema.org SportsEvent. */
export function event(match: EventMatchInput): JsonLd {
  const result: JsonLd = {
    "@context": SCHEMA_ORG,
    "@type": "SportsEvent",
    name: `${match.homeTeamName} – ${match.guestTeamName}`,
    sport: SPORT,
    startDate: kickoffIso(match.kickoffDate, match.kickoffTime),
    homeTeam: { "@type": "SportsTeam", name: match.homeTeamName },
    awayTeam: { "@type": "SportsTeam", name: match.guestTeamName },
  };
  const location = eventLocation(match);
  if (location !== null) result.location = location;
  return result;
}

/**
 * JSON for a `<script type="application/ld+json">` body. `<` is escaped so
 * CMS-authored content containing `</script>` can never break out of the tag.
 */
export function serializeJsonLd(value: JsonLd | readonly JsonLd[]): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}
