/**
 * Collapses an SWR result into the three states a screen can actually render.
 *
 * Screens used to branch on `isLoading || !data`, which spins forever on a
 * failed fetch: SWR sets `isLoading: false` when the request settles, but
 * `data` stays `undefined` on failure, so the "loading" branch stayed up with
 * no error message and no retry — and, on the home screen, pull-to-refresh
 * lived inside the unreachable success branch.
 *
 * Rules, in order:
 *  1. Any data at all -> `ready`. SWR is stale-while-revalidate: a background
 *     revalidation failure must not blank out content the user can still read.
 *  2. No data, request still in flight -> `loading`.
 *  3. No data, request settled -> `error`, whether or not SWR captured an
 *     error object. Something must offer the user a retry.
 */
export type FetchState = "loading" | "error" | "ready";

export function resolveFetchState(input: {
  isLoading: boolean;
  error: unknown;
  data: unknown;
}): FetchState {
  if (input.data !== undefined && input.data !== null) return "ready";
  if (input.isLoading) return "loading";
  return "error";
}
