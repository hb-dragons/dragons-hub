import { useEffect, useRef } from "react";
import * as Device from "expo-device";
import { router } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { getPushPermissionStatus, registerForPush } from "@/lib/push/registration";
import { decidePushFlow, readPushPromptDeferred } from "@/lib/push/pre-prompt";
import {
  setPushAuthState,
  subscribeToTaps,
  type PushAuthState,
} from "@/lib/push/handler";

/**
 * Mounts the push tap subscription and, whenever an authenticated session
 * exists, either registers the device's push token (permission already
 * granted) or opens the pre-permission sheet once (#237).
 *
 * Must be mounted INSIDE the auth tree (so the session is available)
 * and above any screen that expects taps to deep-link.
 */
export function usePushRegistration(): void {
  const { data: session, isPending } = authClient.useSession();
  // One sheet per sign-in: the effect re-runs on the same user id only after
  // sign-out, which resets this.
  const prompted = useRef(false);

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

  // Decide once per session (every boot — server upserts idempotently).
  useEffect(() => {
    if (!session?.user) {
      prompted.current = false;
      return;
    }
    let cancelled = false;
    void (async () => {
      const [status, deferred] = await Promise.all([
        getPushPermissionStatus(),
        readPushPromptDeferred(),
      ]);
      if (cancelled) return;
      const flow = decidePushFlow({ isDevice: Device.isDevice, signedIn: true, status, deferred });
      if (flow === "register") {
        await registerForPush();
      } else if (flow === "prompt" && !prompted.current) {
        prompted.current = true;
        router.push("/push-permission");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  // Tap subscription + cold-start tap check. Subscribe once.
  useEffect(() => {
    return subscribeToTaps();
  }, []);
}
