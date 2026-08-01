import { z } from "astro/zod";

/**
 * Build-time league-name lookup for the teams pages.
 *
 * The legacy CMS stored `leagueName` on every team; the new CMS deliberately
 * drops it (sync data lives API-side), so the static pages join it from
 * `/public/standings` via the `apiTeamPermanentId` key at build time. Follows
 * the loaders' failure model (src/lib/payload.ts): callers gate the fetch on
 * a content build, and once it runs any failure — non-200, network error,
 * shape drift — throws and fails the build loudly.
 */

const standingsSchema = z.array(
  z.object({
    leagueName: z.string(),
    standings: z.array(z.object({ teamApiId: z.number() })),
  }),
);

/** Maps every standings row's `teamApiId` to its league's display name. */
export async function fetchTeamLeagueNames(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Map<number, string>> {
  const url = `${baseUrl.replace(/\/$/, "")}/public/standings`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`standings: HTTP ${res.status} for ${url}`);
  const leagues = standingsSchema.parse(await res.json());
  const names = new Map<number, string>();
  for (const league of leagues) {
    for (const row of league.standings) names.set(row.teamApiId, league.leagueName);
  }
  return names;
}
