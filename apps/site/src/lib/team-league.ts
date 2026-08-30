import { z } from "astro/zod";

import type { StandingRowInput } from "./team-standings";

/**
 * Build-time standings for the teams pages.
 *
 * The legacy CMS stored `leagueName` on every team; the new CMS deliberately
 * drops it (sync data lives API-side), so the static pages join it from
 * `/public/standings` via the `apiTeamPermanentId` key at build time — and
 * since the same response carries the full tables, the Tabelle tab's first
 * paint comes from the identical fetch. Follows the loaders' failure model
 * (src/lib/payload.ts): callers gate the fetch on a content build, and once
 * it runs any failure — non-200, network error, shape drift — throws and
 * fails the build loudly.
 */

// z.object strips undeclared keys, so the rows embedded into the static HTML
// carry exactly what the Tabelle tab renders (team-standings.ts
// StandingRowInput). `verzicht` is optional for the same reason it is on
// PublicStandingItem: the live API may lag a deploy behind.
const standingRowSchema = z.object({
  position: z.number(),
  teamApiId: z.number(),
  teamName: z.string(),
  played: z.number(),
  won: z.number(),
  lost: z.number(),
  leaguePoints: z.number(),
  pointsFor: z.number(),
  pointsAgainst: z.number(),
  verzicht: z.boolean().optional(),
}) satisfies z.ZodType<StandingRowInput>;

const leagueSchema = z.object({
  leagueName: z.string(),
  standings: z.array(standingRowSchema),
});

const standingsSchema = z.array(leagueSchema);

/** One league as the build consumes it — name plus the rendered row slice. */
export type BuildLeagueStandings = z.infer<typeof leagueSchema>;

/** A team's league name from the lookup — null without a key or a match. */
export function leagueNameFor(
  names: ReadonlyMap<number, string>,
  apiTeamPermanentId: number | null | undefined,
): string | null {
  if (apiTeamPermanentId == null) return null;
  return names.get(apiTeamPermanentId) ?? null;
}

/** Every tracked league from `/public/standings`, rows narrowed and validated. */
export async function fetchStandingsLeagues(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<BuildLeagueStandings[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/public/standings`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`standings: HTTP ${res.status} for ${url}`);
  return standingsSchema.parse(await res.json());
}

/** Maps every standings row's `teamApiId` to its league's display name. */
export function teamLeagueNames(leagues: readonly BuildLeagueStandings[]): Map<number, string> {
  const names = new Map<number, string>();
  for (const league of leagues) {
    for (const row of league.standings) names.set(row.teamApiId, league.leagueName);
  }
  return names;
}
