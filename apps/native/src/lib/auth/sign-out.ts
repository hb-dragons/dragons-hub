import { mutate as globalMutate } from "swr";
import { router } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { unregisterForPush } from "@/lib/push/registration";

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
 * 3. Clear every SWR cache entry without revalidating, so post-signOut
 *    screens never serve the previous user's cached data via
 *    stale-while-revalidate.
 * 4. Navigate home. `router` is a stable singleton from expo-router; safe to
 *    call outside the React tree (e.g. from the 401 response interceptor).
 */
export async function performSignOut(): Promise<void> {
  await unregisterForPush();
  await authClient.signOut().catch(() => {});
  await globalMutate(() => true, undefined, { revalidate: false });
  router.replace("/");
}
