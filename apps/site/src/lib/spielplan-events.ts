/**
 * The Spielplan page's SportsEvent JSON-LD snapshot (plan Task C8), selected
 * from the build-time full plan (src/lib/full-plan.ts) — the same fetch that
 * feeds the island's first paint, so the SEO events and the visible plan can
 * never disagree within a build.
 */
import { todayInClubZone } from "@dragons/shared";

import type { PlanGame } from "./full-plan";

/**
 * How many upcoming games become SportsEvent entries. A build-time snapshot
 * goes stale until the next deploy, so a short horizon beats dumping the
 * whole season into every crawl.
 */
export const UPCOMING_EVENT_LIMIT = 12;

/**
 * The next {@link UPCOMING_EVENT_LIMIT} games from today (club zone) on,
 * soonest first — the plan arrives kickoff-ascending from `/public/matches`.
 */
export function upcomingMatches(plan: readonly PlanGame[], now: Date = new Date()): PlanGame[] {
  const today = todayInClubZone(now);
  return plan
    .filter((game) => game.kickoffDate.localeCompare(today) >= 0)
    .slice(0, UPCOMING_EVENT_LIMIT);
}
