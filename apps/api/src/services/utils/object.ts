/**
 * Build a patch object from the keys of `source` whose value is not `undefined`.
 *
 * Replaces the repeated `if (x !== undefined) set.x = x` boilerplate used to
 * assemble Drizzle `.set(...)` payloads for partial updates — and lets callers
 * keep a precise type instead of widening to `Record<string, unknown>`. `null`
 * is preserved; only `undefined` is dropped.
 */
export function pickDefined<T extends object, K extends keyof T>(
  source: T,
  keys: readonly K[],
): Partial<Pick<T, K>> {
  const out: Partial<Pick<T, K>> = {};
  for (const key of keys) {
    if (source[key] !== undefined) {
      out[key] = source[key];
    }
  }
  return out;
}
