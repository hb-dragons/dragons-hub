import path from "node:path";
import { fileURLToPath } from "node:url";

import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { gcsStorage } from "@payloadcms/storage-gcs";
import { buildConfig } from "payload";
import sharp from "sharp";

import { Media } from "./collections/media";
import { Users } from "./collections/users";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default buildConfig({
  // Deliberately not zod-validated: this module is imported during `next build`,
  // which runs in CI with neither var set (page-data collection only — nothing
  // connects). Eager validation here would fail that build; Payload/pg reject
  // missing values at first real use instead.
  secret: process.env.PAYLOAD_SECRET!,
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL_CMS! },
  }),
  editor: lexicalEditor(),
  collections: [Users, Media],
  // Prod stores media in GCS (bucket + service account from OpenTofu, Task A5);
  // without the var, dev falls back to Payload's local disk storage.
  plugins: process.env.GCS_MEDIA_BUCKET
    ? [
        gcsStorage({
          collections: { media: true },
          bucket: process.env.GCS_MEDIA_BUCKET,
          options: {},
        }),
      ]
    : [],
  sharp,
  typescript: { outputFile: path.resolve(dirname, "payload-types.ts") },
});
