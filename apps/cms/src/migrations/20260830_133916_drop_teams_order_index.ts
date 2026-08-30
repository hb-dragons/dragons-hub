import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/**
 * Teams switched from the hand-numbered `orderIndex` to Payload's `orderable`
 * drag-and-drop (`_order`, added by 20260830_133823_add_teams_order). Before
 * the old column goes, its ordering is copied into `_order` as fractional-index
 * keys, so the published team order survives the switch and editors only drag
 * when they *want* a different order.
 *
 * Key scheme: `generateKeyBetween` appends produce 'a0', 'a1', … 'a9', 'aA', …
 * (base62 digits 0-9A-Za-z, which sort the same in ASCII), so seeding with
 * 'a' + one base62 digit matches what the runtime hook would have generated.
 * That covers 62 teams; the club has 9.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY order_index, id) - 1 AS rn FROM "teams"
  )
  UPDATE "teams" t
    SET "_order" = 'a' || substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', (o.rn)::int + 1, 1)
    FROM ordered o WHERE t.id = o.id;
  UPDATE "_teams_v" v SET "version__order" = t."_order" FROM "teams" t WHERE v.parent_id = t.id;
  ALTER TABLE "teams" DROP COLUMN "order_index";
  ALTER TABLE "_teams_v" DROP COLUMN "version_order_index";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Restores the columns, not the numbers — the ordering itself lives on in
  // `_order`.
  await db.execute(sql`
   ALTER TABLE "teams" ADD COLUMN "order_index" numeric;
  ALTER TABLE "_teams_v" ADD COLUMN "version_order_index" numeric;`)
}
