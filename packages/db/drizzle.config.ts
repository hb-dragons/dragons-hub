import { config } from "dotenv";
config({ path: "../../.env" });
import { defineConfig } from "drizzle-kit";

// Guard: `drizzle-kit push` drops indexes that are not declared in the TS schema,
// and three production indexes exist only in hand-written SQL migrations
// (see drizzle/README.md). Refuse the command however it is invoked — via a
// package script, `pnpm exec drizzle-kit push`, or `npx drizzle-kit push`.
if (process.argv.slice(2).includes("push")) {
  throw new Error(
    "drizzle-kit push is disabled in this repo: it would drop notification_log_dedup_idx, " +
      "domain_events_outbox_idx and referee_games_status_kickoff_idx, which exist only in " +
      "hand-written migrations. Use db:generate + db:migrate instead (see drizzle/README.md).",
  );
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
