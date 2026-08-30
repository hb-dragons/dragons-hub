import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "teams" ADD COLUMN "_order" varchar;
  ALTER TABLE "_teams_v" ADD COLUMN "version__order" varchar;
  CREATE INDEX "teams__order_idx" ON "teams" USING btree ("_order");
  CREATE INDEX "_teams_v_version_version__order_idx" ON "_teams_v" USING btree ("version__order");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "teams__order_idx";
  DROP INDEX "_teams_v_version_version__order_idx";
  ALTER TABLE "teams" DROP COLUMN "_order";
  ALTER TABLE "_teams_v" DROP COLUMN "version__order";`)
}
