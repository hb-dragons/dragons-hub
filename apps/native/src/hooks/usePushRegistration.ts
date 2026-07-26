import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { registerForPush } from "@/lib/push/registration";
import {
  setPushAuthState,
  subscribeToTaps,
  type PushAuthState,
} from "@/lib/push/handler";

/**
 * Mounts the push tap subscription and registers the current device's
 * push token whenever an authenticated session exists.
 *
 * Must be mounted INSIDE the auth tree (so the session is available)
 * and above any screen that expects taps to deep-link.
 */
export function usePushRegistration(): void {
  const { data: session, isPending } = authClient.useSession();

  // Feed the session state to the deep-link gate FIRST, so a cold-start tap
  // resolved by the subscription below is held rather than followed blind.
  // While `isPending`, "no session" is indistinguishable from "not restored
  // yet", so the gate is told neither.
  const pushAuthState: PushAuthState = isPending
    ? "unknown"
    : session?.user
      ? "signed-in"
      : "signed-out";
  useEffect(() => {
    setPushAuthState(pushAuthState);
  }, [pushAuthState]);

  // Register when authenticated (every boot — server upserts idempotently)
  useEffect(() => {
    if (session?.user) {
      void registerForPush();
    }
  }, [session?.user?.id]);

  // Tap subscription + cold-start tap check. Subscribe once.
  useEffect(() => {
    return subscribeToTaps();
  }, []);
}
