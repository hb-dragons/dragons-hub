import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/**
 * Drops `people.phone` (issue #333). The collection is `read: anyone`, so the
 * column was public, and nothing rendered it: the site's `person` schema
 * declared it without a consumer, and the phone number a referee needs comes
 * from the Hub's `staff_people` (ADR-0008). Vorstand and positions, the two
 * things that still reference `people`, never showed one.
 *
 * `down` restores the nullable column, not the numbers: they are gone with
 * the column and come back only from a database backup.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "people" DROP COLUMN "phone";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "people" ADD COLUMN "phone" varchar;`)
}
