/**
 * Display formatting for the content pages, ported from the legacy Vue pages
 * (downloads/index.vue, shop ProductCard.vue, NuxtTime usages).
 */

const FILE_SIZE_UNITS = ["KB", "MB", "GB"] as const;

/**
 * Legacy downloads badge: two decimals, trailing zeros trimmed, units starting
 * at KB. The legacy site received Strapi sizes already in KB; Payload delivers
 * bytes, so the input is scaled to KB first — the rendered text stays
 * identical for identical files.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 KB";
  const k = 1024;
  const kb = bytes / k;
  const i = Math.min(
    Math.max(Math.floor(Math.log(kb) / Math.log(k)), 0),
    FILE_SIZE_UNITS.length - 1,
  );
  return `${parseFloat((kb / Math.pow(k, i)).toFixed(2))} ${FILE_SIZE_UNITS[i]}`;
}

/** Legacy downloads badge: special-cases the Office mimes, else the subtype. */
export function formatMimeType(mime: string): string {
  const upper = mime.toUpperCase();
  if (upper.includes("VND.OPENXMLFORMATS-OFFICEDOCUMENT.WORDPROCESSINGML.DOCUMENT")) {
    return "DOCX";
  }
  if (upper.includes("VND.OPENXMLFORMATS-OFFICEDOCUMENT.SPREADSHEETML.SHEET")) {
    return "XLSX";
  }
  return mime.split("/")[1]?.toUpperCase() || "FILE";
}

/** Long German date ("1. September 2025") — the site is de-only. */
export function formatDateDe(date: Date): string {
  return date.toLocaleDateString("de-DE", { year: "numeric", month: "long", day: "numeric" });
}

/**
 * Shop price, formatted like the legacy `Intl.NumberFormat` EUR output
 * ("38,34 €"). The CMS stores price as a number (issue #165, D3) — Strapi
 * stored it numerically and the previous free-text field could not be sorted
 * or compared.
 */
export function formatPrice(price: number | null | undefined): string | null {
  if (price == null || Number.isNaN(price)) return null;
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(price);
}
