import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/**
 * Payload 3.90.0 (security release) adds `resetPasswordRequestedAt` to every
 * auth collection, to throttle forgot-password requests. Its release notes ask
 * relational projects to generate a migration for it; this is that migration,
 * created with `payload migrate:create` against a fresh database. The other
 * column 3.90 introduces, `_objectKey`, only exists on collections with
 * `clientUploads`, which this CMS does not use.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" ADD COLUMN "reset_password_requested_at" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" DROP COLUMN "reset_password_requested_at";`)
}
