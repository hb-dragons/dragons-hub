import { buildTestDbTemplate } from "./src/test/setup-test-db";

/**
 * Replay the migrations once for the whole run and cache the resulting PGlite
 * data directory, so the ~80 integration test files restore a snapshot instead
 * of each running `initdb` plus every migration. See the decision record at the
 * top of `src/test/setup-test-db.ts`.
 *
 * Building here rather than lazily in the first worker keeps a cold cache from
 * being built once per worker on the first run after a checkout, which is every
 * run in CI.
 */
export default async function setup(): Promise<void> {
  await buildTestDbTemplate();
}
