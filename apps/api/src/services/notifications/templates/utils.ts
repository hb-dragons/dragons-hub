/**
 * Format a date string (YYYY-MM-DD) as DD.MM. for German display
 * or MM/DD for English. Uses string splitting to avoid timezone issues.
 */
export function formatDate(dateStr: string, locale: string): string {
  const parts = dateStr.split("-");
  if (parts.length < 3) return dateStr;
  const [, month, day] = parts;
  if (locale === "de") {
    return `${day}.${month}.`;
  }
  return `${month}/${day}`;
}
