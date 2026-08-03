import { createUpload } from "./payload-client";
import { downloadFile, fetchUploads } from "./strapi";

/**
 * Uploads every Strapi file into Payload media and returns the id map every
 * later collection run needs.
 *
 * Sequential on purpose: 73 files against a scale-to-zero Cloud Run container
 * that runs sharp + blurhash per image. Concurrency buys seconds and risks
 * memory pressure.
 *
 * Strapi's derived `formats` (thumbnail/small/medium) are not migrated —
 * Payload and the site generate their own.
 */
export async function migrateMedia(): Promise<Map<number, number>> {
  const files = await fetchUploads();
  const map = new Map<number, number>();
  let index = 0;
  for (const file of files) {
    index += 1;
    const blob = await downloadFile(file.url);
    // Strapi hashes filenames on upload, so file.url's basename is already
    // safe — no spaces, parentheses or umlauts, whatever the display name is.
    const filename = file.url.split("/").pop() ?? file.name;
    const doc = await createUpload("media", blob, filename, { alt: file.alternativeText });
    map.set(file.id, doc.id);
    console.log(`  media ${index}/${files.length}  ${filename} → ${doc.id}`);
  }
  return map;
}
