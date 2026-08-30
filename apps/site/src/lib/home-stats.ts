/**
 * Build-time inputs from the API's `/public/home/dashboard`: club stats for
 * the home Join section, plus the upcoming games the NextGames island first
 * paints with (the island refetches the same endpoint client-side to stay
 * fresh between the nightly rebuilds).
 *
 * `fetchHomeDashboard` follows the loaders' failure model (src/lib/payload.ts):
 * the caller gates it on a content build (site-settings present), and once it
 * runs, any failure — non-200, network error, shape drift — throws and fails
 * the build loudly. Env-less shell builds never call it, so CI without
 * secrets stays green.
 */
import { z } from "astro/zod";
import type { MatchListItem } from "@dragons/shared";

/** The MatchListItem fields the home page renders and serializes into HTML. */
export type HomeGame = Pick<
  MatchListItem,
  | "id"
  | "kickoffDate"
  | "kickoffTime"
  | "homeTeamName"
  | "guestTeamName"
  | "homeTeamCustomName"
  | "guestTeamCustomName"
  | "homeIsOwnClub"
  | "guestIsOwnClub"
  | "homeClubId"
  | "guestClubId"
  | "homeBadgeColor"
  | "guestBadgeColor"
  | "venueName"
  | "venueStreet"
  | "venuePostalCode"
  | "venueCity"
  | "venueNameOverride"
  | "homeScore"
  | "guestScore"
>;

// z.object strips undeclared keys, so the games embedded in the static HTML
// carry exactly the rendered fields, not the full MatchListItem.
const homeGameSchema = z.object({
  id: z.number(),
  kickoffDate: z.string(),
  kickoffTime: z.string(),
  homeTeamName: z.string(),
  guestTeamName: z.string(),
  homeTeamCustomName: z.string().nullable(),
  guestTeamCustomName: z.string().nullable(),
  homeIsOwnClub: z.boolean(),
  guestIsOwnClub: z.boolean(),
  homeClubId: z.number(),
  guestClubId: z.number(),
  homeBadgeColor: z.string().nullable(),
  guestBadgeColor: z.string().nullable(),
  venueName: z.string().nullable(),
  venueStreet: z.string().nullable(),
  venuePostalCode: z.string().nullable(),
  venueCity: z.string().nullable(),
  venueNameOverride: z.string().nullable(),
  homeScore: z.number().nullable(),
  guestScore: z.number().nullable(),
}) satisfies z.ZodType<HomeGame>;

const dashboardSchema = z.object({
  clubStats: z.object({ teamCount: z.number() }),
  upcomingGames: z.array(homeGameSchema),
});

export interface HomeDashboard {
  teamCount: number;
  upcomingGames: HomeGame[];
}

export function yearsSinceFounding(foundingYear: number, now: Date): number {
  return now.getFullYear() - foundingYear;
}

export async function fetchHomeDashboard(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HomeDashboard> {
  const url = `${baseUrl.replace(/\/$/, "")}/public/home/dashboard`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`home dashboard: HTTP ${res.status} for ${url}`);
  const parsed = dashboardSchema.parse(await res.json());
  return { teamCount: parsed.clubStats.teamCount, upcomingGames: parsed.upcomingGames };
}
