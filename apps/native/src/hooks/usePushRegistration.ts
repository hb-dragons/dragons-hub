import { useEffect, useRef } from "react";
import * as Device from "expo-device";
import { router } from "expo-router";
import { AppState } from "react-native";
import { authClient } from "@/lib/auth-client";
import { getPushPermissionStatus, registerForPush } from "@/lib/push/registration";
import { decidePushFlow, readPushPromptDeferred } from "@/lib/push/pre-prompt";
import { createSessionRegistration } from "@/lib/push/session-registration";
import {
  setPushAuthState,
  subscribeToTaps,
  type PushAuthState,
} from "@/lib/push/handler";

/**
 * Mounts the push tap subscription and, whenever an authenticated session
 * exists, either registers the device's push token (permission already
 * granted) or opens the pre-permission sheet once (#237). Also re-checks on
 * every foreground, so permission granted in iOS Settings registers the
 * device in the same session instead of waiting for the next cold start —
 * once per session rather than once per foreground (#253).
 *
 * Must be mounted INSIDE the auth tree (so the session is available)
 * and above any screen that expects taps to deep-link.
 */
export function usePushRegistration(): void {
  const { data: session, isPending } = authClient.useSession();
  // One sheet per sign-in: the effect re-runs on the same user id only after
  // sign-out, which resets this.
  const prompted = useRef(false);
  // One registration per signed-in session, shared by the sign-in effect and
  // the foreground listener below. Rebuilt when the user id changes so
  // signing in as somebody else registers the device for the new account.
  const userId = session?.user?.id;
  const registration = useRef({ userId, tracker: createSessionRegistration(registerForPush) });
  if (registration.current.userId !== userId) {
    registration.current = { userId, tracker: createSessionRegistration(registerForPush) };
  }
  const { tracker } = registration.current;

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
        await tracker.ensure();
      } else if (flow === "prompt" && !prompted.current) {
        prompted.current = true;
        router.push("/push-permission");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  // Re-register when the app returns from Settings with permission newly
  // granted (#237 review): registerForPush is a no-op unless the OS says
  // granted, so this can never prompt — the sheet is the sign-in effect's
  // job alone. `ensure` makes it a no-op once a token has reached the API,
  // so a banner tap or a control-centre swipe costs nothing (#253).
  useEffect(() => {
    if (!userId) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void tracker.ensure();
    });
    return () => sub.remove();
  }, [userId, tracker]);

  // Tap subscription + cold-start tap check. Subscribe once.
  useEffect(() => {
    return subscribeToTaps();
  }, []);
}
