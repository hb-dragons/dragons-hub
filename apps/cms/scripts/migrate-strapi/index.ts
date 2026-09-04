/**
 * Entry point for `pnpm --filter @dragons/cms migrate:strapi`.
 *
 * Historical: this ran once, against a CMS that still had the `trainers`
 * collection and the team's league fields. #316 dropped both, so a rerun would
 * fail on those writes. It stays as the record of how Strapi's content got
 * here.
 *
 * Nothing but the runner lives here. The orchestration is in migrate.ts so a
 * test can import `main` without the import itself starting a migration
 * against whatever CMS_URL happens to be set — which is also why this file,
 * and only this file, is excluded from the coverage gate (vitest.config.ts).
 *
 * Required environment (see apps/cms/.env.example):
 *   STRAPI_URL, STRAPI_TOKEN, CMS_URL, CMS_API_TOKEN
 */
import { main } from "./migrate";

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
