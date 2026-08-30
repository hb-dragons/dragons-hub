/**
 * Build-time fetch of the full season plan from `/public/matches` — the data
 * behind the Spielplan page's and the team pages' first paint. The islands
 * used to fetch this client-side only; content builds now embed the same
 * games into the static HTML and the client refetch merely revalidates
 * (same model as the home dashboard in src/lib/home-stats.ts).
 *
 * Follows the loaders' failure model (src/lib/payload.ts): the pages gate the
 * call on a content build, and once it runs any failure — non-200, network
 * error, shape drift — throws and fails the build loudly. Env-less shell
 * builds never call it.
 */
import { z } from "astro/zod";
import type { MatchListItem } from "@dragons/shared";

import { fetchFullPlan } from "./spielplan";
import { sortGamesByKickoff } from "./team-games";

/**
 * The `MatchListItem` fields the site renders and serializes into HTML: the
 * GameCard slice (id, sides, badges, scores, venue address), the Spielplan
 * filters/Excel export (matchNo, leagueName, publicComment) and the team-page
 * join keys (homeTeamApiId/guestTeamApiId).
 */
export type PlanGame = Pick<
  MatchListItem,
  | "id"
  | "matchNo"
  | "kickoffDate"
  | "kickoffTime"
  | "homeTeamApiId"
  | "guestTeamApiId"
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
  | "leagueName"
  | "venueName"
  | "venueStreet"
  | "venuePostalCode"
  | "venueCity"
  | "venueNameOverride"
  | "homeScore"
  | "guestScore"
  | "publicComment"
>;

// z.object strips undeclared keys, so the games embedded in the static HTML
// carry exactly the rendered fields, not the full MatchListItem.
const planGameSchema = z.object({
  id: z.number(),
  matchNo: z.number(),
  kickoffDate: z.string(),
  kickoffTime: z.string(),
  homeTeamApiId: z.number(),
  guestTeamApiId: z.number(),
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
  leagueName: z.string().nullable(),
  venueName: z.string().nullable(),
  venueStreet: z.string().nullable(),
  venuePostalCode: z.string().nullable(),
  venueCity: z.string().nullable(),
  venueNameOverride: z.string().nullable(),
  homeScore: z.number().nullable(),
  guestScore: z.number().nullable(),
  publicComment: z.string().nullable(),
}) satisfies z.ZodType<PlanGame>;

const pageSchema = z.object({
  items: z.array(planGameSchema),
  hasMore: z.boolean(),
});

/** The whole season from `/public/matches`, kickoff-ascending. */
export async function fetchBuildPlan(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PlanGame[]> {
  return fetchFullPlan(async (params) => {
    const url = new URL(`${baseUrl.replace(/\/$/, "")}/public/matches`);
    url.searchParams.set("limit", String(params.limit));
    url.searchParams.set("offset", String(params.offset));
    url.searchParams.set("sort", params.sort);
    const res = await fetchImpl(url.toString());
    if (!res.ok) throw new Error(`matches: HTTP ${res.status} for ${url.toString()}`);
    return pageSchema.parse(await res.json());
  });
}

/** One team's games — either side matches the CMS `apiTeamPermanentId` key. */
export function teamGames(plan: readonly PlanGame[], teamApiId: number | null): PlanGame[] {
  if (teamApiId == null) return [];
  return plan.filter(
    (game) => game.homeTeamApiId === teamApiId || game.guestTeamApiId === teamApiId,
  );
}

/**
 * The team page's "Letztes Spiel" / "Nächstes Spiel" pair, derived from the
 * plan the way the island queries the API (src/lib/team-games.ts): prev is
 * the latest scored game up to and including `today` (`dateTo` + `hasScore`,
 * which the API implements as both scores non-null), next the first game from
 * `today` on (`dateFrom`). A scored game today fills both slots, exactly like
 * the two inclusive date filters.
 */
export function prevNextGames(
  games: readonly PlanGame[],
  today: string,
): { prev: PlanGame | null; next: PlanGame | null } {
  const sorted = sortGamesByKickoff(games, "asc");
  const prev = sorted
    .filter(
      (game) =>
        game.kickoffDate.localeCompare(today) <= 0 &&
        game.homeScore !== null &&
        game.guestScore !== null,
    )
    .at(-1);
  const next = sorted.find((game) => game.kickoffDate.localeCompare(today) >= 0);
  return { prev: prev ?? null, next: next ?? null };
}
