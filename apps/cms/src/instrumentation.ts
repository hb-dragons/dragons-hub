// Next.js instrumentation hook: runs once when the server process starts,
// before it serves traffic. Initializing Payload here makes the postgres
// adapter's `prodMigrations` (see payload.config.ts) run at container boot —
// the deploy contract for Cloud Run (issue #164) — instead of lazily on the
// first request that touches Payload.
//
// Guards: prodMigrations only apply under NODE_ENV=production anyway, and in
// dev Payload manages the schema in push mode, so outside production this
// must stay a no-op (a dev server boot must not require the database).
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;

  const [{ getPayload }, { default: config }] = await Promise.all([
    import("payload"),
    import("./payload.config"),
  ]);
  await getPayload({ config });
}
