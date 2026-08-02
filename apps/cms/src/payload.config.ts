import path from "node:path";
import { fileURLToPath } from "node:url";

import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { gcsStorage } from "@payloadcms/storage-gcs";
import { buildConfig } from "payload";
import sharp from "sharp";

import { Downloads } from "./collections/downloads";
import { Media } from "./collections/media";
import { Pages } from "./collections/pages";
import { Partners } from "./collections/partners";
import { People } from "./collections/people";
import { Positions } from "./collections/positions";
import { Posts } from "./collections/posts";
import { Projects } from "./collections/projects";
import { ShopItems } from "./collections/shop-items";
import { Teams } from "./collections/teams";
import { TimelineItems } from "./collections/timeline-items";
import { Trainers } from "./collections/trainers";
import { Users } from "./collections/users";
import { Vorstand } from "./collections/vorstand";
import { BackgroundVideo } from "./globals/background-video";
import { SiteSettings } from "./globals/site-settings";
import { TeamBackground } from "./globals/team-background";
import { publicUrlSettings } from "./lib/public-url";
import { migrations } from "./migrations";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default buildConfig({
  // Deliberately not zod-validated: this module is imported during `next build`,
  // which runs in CI with neither var set (page-data collection only — nothing
  // connects). Eager validation here would fail that build; Payload/pg reject
  // missing values at first real use instead.
  secret: process.env.PAYLOAD_SECRET!,
  // serverURL/cors/csrf come from CMS_PUBLIC_URL so the testing→prod domain
  // switch at cutover is env-only. Unset (dev, CI) = relative URLs.
  ...publicUrlSettings(process.env.CMS_PUBLIC_URL),
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL_CMS! },
    // Dev manages the schema in push mode; prod runs the committed migrations
    // at boot (NODE_ENV=production only — src/instrumentation.ts forces the
    // init). Generated with `payload migrate:create` against a fresh local db.
    migrationDir: path.resolve(dirname, "migrations"),
    prodMigrations: migrations,
  }),
  editor: lexicalEditor(),
  collections: [
    Users,
    Media,
    Posts,
    Pages,
    Teams,
    People,
    Vorstand,
    Positions,
    Trainers,
    Partners,
    Projects,
    Downloads,
    ShopItems,
    TimelineItems,
  ],
  globals: [SiteSettings, TeamBackground, BackgroundVideo],
  // Prod stores media in GCS (bucket + service account from OpenTofu, Task A5);
  // without the var, dev falls back to Payload's local disk storage.
  plugins: process.env.GCS_MEDIA_BUCKET
    ? [
        gcsStorage({
          // disablePayloadAccessControl makes `doc.url` the absolute
          // https://storage.googleapis.com/<bucket>/… URL (the adapter's
          // generateURL → File.publicUrl()) instead of a relative
          // /api/media/file/… path proxied by this scale-to-zero service.
          // The site bakes these URLs into built HTML, so media must come
          // straight from GCS; the bucket grants allUsers objectViewer in
          // tofu, matching the collection's public read access.
          collections: { media: { disablePayloadAccessControl: true } },
          bucket: process.env.GCS_MEDIA_BUCKET,
          options: {},
        }),
      ]
    : [],
  sharp,
  typescript: { outputFile: path.resolve(dirname, "payload-types.ts") },
});
