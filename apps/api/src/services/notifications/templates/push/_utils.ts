import type { Locale } from "./types";

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

export function formatDate(iso: string, locale: Locale): string {
  const [y, m, d] = iso.split("-");
  return locale === "de" ? `${d}.${m}.${y}` : `${y}-${m}-${d}`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Producers stringify their values, but a kickoff field is legitimately absent
 * or null on some paths. Anything that is not a non-empty string is dropped
 * rather than stringified, so a caller can shorten its sentence instead of
 * printing "undefined"/"null" into a user-facing push.
 */
function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Formats ISO dates for the locale; passes anything else (e.g. "TBD") through. */
export function formatDatePart(value: unknown, locale: Locale): string {
  const raw = asText(value);
  if (!raw) return "";
  return ISO_DATE.test(raw) ? formatDate(raw, locale) : raw;
}

/** Drops the seconds component so pushes read "17:30", not "17:30:00". */
export function formatTimePart(value: unknown): string {
  const raw = asText(value);
  if (!raw) return "";
  return /^\d{2}:\d{2}(:\d{2})?$/.test(raw) ? raw.slice(0, 5) : raw;
}
