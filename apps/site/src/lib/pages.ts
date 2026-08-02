/**
 * Lookup for the CMS `pages` collection entries every content page repeats:
 * published only (the build user's API key sees drafts — `publishedOrAuthed`
 * read access), first matching slug wins.
 *
 * Takes the already-loaded entries instead of calling `getCollection` so the
 * logic stays unit-testable (`astro:content` is a virtual module vitest
 * cannot import).
 */

interface PageLike {
  slug: string;
  _status?: "draft" | "published" | null | undefined;
}

/**
 * The published page for the first slug (in order) that has one, or null.
 * Extra slugs cover legacy Strapi names until the A6 migration pins the
 * mapping (e.g. supporter/partner, team/kontakt).
 */
export function publishedPage<T extends PageLike>(
  entries: readonly { data: T }[],
  ...slugs: [string, ...string[]]
): T | null {
  for (const slug of slugs) {
    const match = entries.find(
      (entry) => entry.data._status === "published" && entry.data.slug === slug,
    );
    if (match !== undefined) return match.data;
  }
  return null;
}
