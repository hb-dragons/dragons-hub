/**
 * Postgres `unique_violation` (23505). Drizzle wraps driver errors in a
 * `DrizzleQueryError` and hangs the original off `cause`, so the code is looked
 * for along the whole chain rather than on the thrown object alone.
 *
 * Used wherever a read-then-write guard can lose a race: the guard answers the
 * caller in the usual case, this turns the lost race into the same answer
 * rather than into a 500.
 */
export function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  const causeCode = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  return code === "23505" || causeCode === "23505";
}
