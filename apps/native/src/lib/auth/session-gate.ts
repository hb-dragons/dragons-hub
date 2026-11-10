/**
 * Whether the root layout may render the app as far as the session goes.
 *
 * Latches on the first resolved restore. better-auth refetches the session
 * every time the app returns to the foreground, and while signed out it
 * reports that refetch as `isPending: true` again (its session atom sets
 * `isPending: current.data === null`). Gating the tree on the live flag
 * unmounted the whole navigator on every foreground: coming back from a
 * password manager's AutoFill threw away the sign-in sheet and its filled
 * fields and landed on Home.
 *
 * After the first restore, a refetch only ever refreshes data the app already
 * has a screen for, so nothing needs to wait on it.
 */
export function sessionGateSettled(previouslySettled: boolean, isPending: boolean): boolean {
  return previouslySettled || !isPending;
}
