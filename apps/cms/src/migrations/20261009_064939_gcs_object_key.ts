import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/**
 * The cloud-storage plugin in Payload 3.90 adds an `_objectKey` field to every
 * collection it manages, not only to ones with `clientUploads` (as the
 * 20261008 migration assumed). That migration was generated with
 * GCS_MEDIA_BUCKET unset, so the plugin was not loaded and the column was
 * missed. In production the plugin is on, every media query selects
 * `_objectkey`, and Postgres rejects it: media, and every downloads/teams/…
 * read that populates a media relation, returned 500. Generated with
 * `payload migrate:create` with GCS_MEDIA_BUCKET set.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "_objectkey" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media" DROP COLUMN "_objectkey";`)
}
