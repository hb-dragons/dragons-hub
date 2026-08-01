import { COLOR_PRESET_KEYS, getColorPreset } from "@dragons/shared";

/**
 * Literal copies of every shared color preset's class string.
 *
 * The site's Tailwind bundle only scans `apps/site/src` and `packages/ui`
 * (see site.css `@source`) — never `packages/shared` — so the preset classes
 * must appear verbatim in this tree or Tailwind emits no rules for them and
 * every badge renders gray. The parity test pins this map name-for-name and
 * string-for-string to `@dragons/shared`, so it cannot drift silently.
 */
export const TEAM_BADGE_CLASSES: Record<string, string> = {
  blue: "bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-800 dark:border-blue-600 dark:text-blue-100",
  teal: "bg-teal-100 border-teal-300 text-teal-800 dark:bg-teal-700 dark:border-teal-500 dark:text-teal-100",
  green:
    "bg-green-100 border-green-300 text-green-800 dark:bg-green-700 dark:border-green-500 dark:text-green-100",
  orange:
    "bg-orange-100 border-orange-300 text-orange-800 dark:bg-orange-700 dark:border-orange-500 dark:text-orange-100",
  rose: "bg-rose-100 border-rose-300 text-rose-800 dark:bg-rose-800 dark:border-rose-600 dark:text-rose-100",
  pink: "bg-pink-100 border-pink-300 text-pink-800 dark:bg-pink-700 dark:border-pink-500 dark:text-pink-100",
  cyan: "bg-cyan-100 border-cyan-300 text-cyan-800 dark:bg-cyan-700 dark:border-cyan-500 dark:text-cyan-100",
  indigo:
    "bg-indigo-100 border-indigo-300 text-indigo-800 dark:bg-indigo-700 dark:border-indigo-500 dark:text-indigo-100",
  emerald:
    "bg-emerald-100 border-emerald-300 text-emerald-800 dark:bg-emerald-800 dark:border-emerald-600 dark:text-emerald-100",
  violet:
    "bg-violet-100 border-violet-300 text-violet-800 dark:bg-violet-700 dark:border-violet-500 dark:text-violet-100",
};

/**
 * The badge class string for a team: its configured preset, or the shared
 * name-hash fallback when the key is missing/unknown — identical color
 * resolution to apps/web's TeamBadge, but served from the local literals
 * above so the classes exist in the site bundle.
 */
export function teamBadgeClassName(
  badgeColor: string | null | undefined,
  teamName: string,
): string {
  const preset = getColorPreset(badgeColor, teamName);
  const key = COLOR_PRESET_KEYS.find((k) => getColorPreset(k) === preset)!;
  return TEAM_BADGE_CLASSES[key]!;
}
