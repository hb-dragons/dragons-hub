import type { Locale } from "./types";

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

export function formatDate(iso: string, locale: Locale): string {
  const [y, m, d] = iso.split("-");
  return locale === "de" ? `${d}.${m}.${y}` : `${y}-${m}-${d}`;
}

export function formatDe(iso: string): string {
  return formatDate(iso, "de");
}
