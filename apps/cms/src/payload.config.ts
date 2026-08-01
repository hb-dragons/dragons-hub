import path from "node:path";
import { fileURLToPath } from "node:url";

import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig } from "payload";
import sharp from "sharp";

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
  collections: [Users],
  sharp,
  typescript: { outputFile: path.resolve(dirname, "payload-types.ts") },
});
