/**
 * Draft filter for every collection with `versions: { drafts: true }`.
 *
 * The build user's API key is authenticated, so Payload's `publishedOrAuthed`
 * read access hands it drafts as well as published documents. Every
 * getCollection call on a drafted collection must filter, or unpublished
 * content ships to the live site.
 *
 * Note this only guards the collection being loaded. A draft reached through a
 * *relation* (people → vorstand) bypasses it entirely, which is why apps/cms
 * deliberately leaves people and media undrafted.
 */
export function publishedOnly(entry: {
  data: { _status?: "draft" | "published" | null | undefined };
}): boolean {
  return entry.data._status === "published";
}
