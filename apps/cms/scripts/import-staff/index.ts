/**
 * Entry point for `pnpm --filter @dragons/cms migrate:cms-staff` (add
 * `--dry-run` to print the planned rows without writing).
 *
 * Nothing but the runner lives here, same as the Strapi importer: a test can
 * import `main` from run.ts without the import itself starting a run
 * against whatever DATABASE_URL happens to be set — which is also why this
 * file, and only this file, is excluded from the coverage gate.
 *
 * Required environment (see apps/cms/.env.example):
 *   CMS_URL, CMS_API_TOKEN, DATABASE_URL
 */
import { main } from "./run";

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
