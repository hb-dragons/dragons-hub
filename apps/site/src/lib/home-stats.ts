/**
 * Club-stats inputs for the home Join section.
 *
 * `fetchTeamCount` hits the API's `/public/home/dashboard` at build time and
 * follows the loaders' failure model (src/lib/payload.ts): the caller gates it
 * on a content build (site-settings present), and once it runs, any failure —
 * non-200, network error, shape drift — throws and fails the build loudly.
 * Env-less shell builds never call it, so CI without secrets stays green.
 */
import { z } from "astro/zod";

const dashboardSchema = z.object({ clubStats: z.object({ teamCount: z.number() }) });

export function yearsSinceFounding(foundingYear: number, now: Date): number {
  return now.getFullYear() - foundingYear;
}

export async function fetchTeamCount(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const url = `${baseUrl.replace(/\/$/, "")}/public/home/dashboard`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`home dashboard: HTTP ${res.status} for ${url}`);
  return dashboardSchema.parse(await res.json()).clubStats.teamCount;
}
