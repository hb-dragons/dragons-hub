/**
 * Entry point for `pnpm --filter @dragons/cms migrate:cms-staff` (add
 * `--dry-run` to print the plan without writing). Two passes, run in order:
 *
 *   migrate:cms-staff                  staff rows (issue #311)
 *   migrate:cms-staff -- --portraits   the rows' portraits (issue #329) — run
 *                                      once in production before #316 deletes
 *                                      the CMS trainers collection the images
 *                                      still live in, then trigger a Website
 *                                      rebuild so the team pages pick them up.
 *
 * Nothing but the runner lives here, same as the Strapi importer: a test can
 * import `main` from run.ts without the import itself starting a run
 * against whatever DATABASE_URL happens to be set — which is also why this
 * file, and only this file, is excluded from the coverage gate.
 *
 * Required environment (see apps/cms/.env.example):
 *   CMS_URL, CMS_API_TOKEN, DATABASE_URL
 *   --portraits also: GCS_BUCKET_NAME (the Hub's asset bucket, the API's
 *   variable of the same name) and Application Default Credentials that may
 *   write to it (`gcloud auth application-default login`).
 */
import { main } from "./run";

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
