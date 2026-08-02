/**
 * Build-time fetch of the next matches for the Spielplan page's SportsEvent
 * JSON-LD (plan Task C8). The visible plan stays a runtime island — this is
 * the SEO snapshot of it, refreshed on every content build. Follows the
 * loaders' failure model (src/lib/payload.ts): the page gates the call on a
 * content build, and once it runs any failure throws and fails the build.
 */
import { todayInClubZone } from "@dragons/shared";
import { z } from "astro/zod";

/** Narrowed to exactly the fields jsonld.ts's `event()` renders. */
const matchSchema = z.object({
  kickoffDate: z.string(),
  kickoffTime: z.string(),
  homeTeamName: z.string(),
  guestTeamName: z.string(),
  venueName: z.string().nullish(),
  venueNameOverride: z.string().nullish(),
  venueStreet: z.string().nullish(),
  venuePostalCode: z.string().nullish(),
  venueCity: z.string().nullish(),
});

const pageSchema = z.object({ items: z.array(matchSchema) });

export type UpcomingMatch = z.infer<typeof matchSchema>;

/**
 * How many upcoming games become SportsEvent entries. A build-time snapshot
 * goes stale until the next deploy, so a short horizon beats dumping the
 * whole season into every crawl.
 */
export const UPCOMING_EVENT_LIMIT = 12;

/** The next {@link UPCOMING_EVENT_LIMIT} own-club matches, soonest first. */
export async function fetchUpcomingMatches(
  baseUrl: string,
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch,
): Promise<UpcomingMatch[]> {
  const url = new URL(`${baseUrl.replace(/\/$/, "")}/public/matches`);
  url.searchParams.set("dateFrom", todayInClubZone(now));
  url.searchParams.set("limit", String(UPCOMING_EVENT_LIMIT));
  url.searchParams.set("sort", "asc");
  const res = await fetchImpl(url.toString());
  if (!res.ok) throw new Error(`matches: HTTP ${res.status} for ${url.toString()}`);
  return pageSchema.parse(await res.json()).items;
}
