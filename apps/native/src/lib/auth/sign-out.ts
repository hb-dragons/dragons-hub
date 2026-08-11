import { router } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { unregisterForPush } from "@/lib/push/registration";
import { swrCache } from "@/lib/swr-config";

/**
 * The single sign-out routine, shared by the manual "Sign Out" action
 * (`profile.tsx`) and the 401-triggered forced sign-out (`lib/api.ts`). Both
 * callers MUST go through this — this is a shared device, and skipping any
 * of these steps leaks one user's session into the next:
 *
 * 1. Deregister this device's push token. Must run BEFORE the auth session
 *    is cleared — the DELETE endpoint requires an authenticated session to
 *    authorize the deletion. `unregisterForPush` never throws.
 * 2. Clear the auth session. Tolerate rejection (e.g. the network is down,
 *    or — on the 401 path — the session is already dead server-side): the
 *    cache clear and redirect below must still happen either way.
 * 3. Wipe `swrCache` — the exact Map instance `swr-config.ts`'s `provider`
 *    hands to SWR, and therefore the only cache any screen in this app
 *    actually reads from — so post-signOut screens never serve the previous
 *    user's cached data via stale-while-revalidate. Deliberately NOT the
 *    top-level `mutate`/`cache` exported by the `swr` package: those are
 *    bound to SWR's own default cache, a separate Map nobody in this app
 *    reads from once a custom `provider` is configured, so clearing it would
 *    be a no-op against the leak this exists to prevent.
 * 4. Navigate home. `router` is a stable singleton from expo-router; safe to
 *    call outside the React tree (e.g. from the 401 response interceptor).
 */
export async function performSignOut(): Promise<void> {
  await unregisterForPush();
  await authClient.signOut().catch(() => {});
  swrCache.clear();
  router.replace("/");
}
