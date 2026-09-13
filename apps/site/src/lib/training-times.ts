/**
 * Training-times block on the team detail page (`/teams/[slug]`, issue #334).
 * The CMS `teams.trainingTimes` array (apps/cms/src/collections/teams.ts)
 * mirrors the legacy Strapi `team.training` component: free-text `day`,
 * `startTime`, optional `endTime`, a plain `gym` name (there is deliberately
 * no gyms endpoint), an optional `gymMapsUrl` and an optional `info` line.
 * Every field is editor-typed text, so this only trims and shapes — no time
 * parsing, no sorting: the editor's order is the schedule's order.
 */

/** The `trainingTime` row of the site's `teams` content schema. */
export interface TrainingTimeInput {
  day: string;
  startTime: string;
  endTime?: string | null | undefined;
  gym: string;
  gymMapsUrl?: string | null | undefined;
  info?: string | null | undefined;
}

/** One rendered row of the block. */
export interface TrainingTimeRow {
  day: string;
  /** `17:00 – 18:30`, or just `17:00` when the row has no end time. */
  time: string;
  gym: string;
  /** External maps link for the gym name; null renders the name as text. */
  mapsHref: string | null;
  /** Muted secondary line under the row; null renders nothing. */
  info: string | null;
}

/** Trimmed text, or null for a missing or whitespace-only value. */
function optionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/** `17:00` + `18:30` → `17:00 – 18:30`; a missing end time leaves the start alone. */
export function formatTimeRange(startTime: string, endTime: string | null | undefined): string {
  const start = startTime.trim();
  const end = optionalText(endTime);
  return end === null ? start : `${start} – ${end}`;
}

/**
 * Display rows for the block, in editor order. Empty for a team without
 * training times (null, undefined or `[]`), so the component renders nothing.
 */
export function trainingTimeRows(
  trainingTimes: readonly TrainingTimeInput[] | null | undefined,
): TrainingTimeRow[] {
  return (trainingTimes ?? []).map((entry) => ({
    day: entry.day.trim(),
    time: formatTimeRange(entry.startTime, entry.endTime),
    gym: entry.gym.trim(),
    mapsHref: optionalText(entry.gymMapsUrl),
    info: optionalText(entry.info),
  }));
}
