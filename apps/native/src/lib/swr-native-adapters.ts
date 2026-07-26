import { AppState, type AppStateStatus } from "react-native";
import * as Network from "expo-network";

/**
 * SWR's built-in `initFocus`/`initReconnect`/`isOnline` hook into
 * `document.visibilitychange` and `window.online`, neither of which exist in
 * React Native — so `revalidateOnFocus` / `revalidateOnReconnect` are inert
 * app-wide without these adapters. This module supplies the React Native
 * equivalents: `AppState` for foreground detection, `expo-network` for
 * connectivity.
 *
 * Unlike the biometric relock (`biometric-relock.ts`), which deliberately
 * ignores `inactive` to avoid nagging the user, staleness has no downside to
 * revalidating too eagerly. So this treats returning to `active` from either
 * `inactive` or `background` as "came back to the app" — matching SWR's own
 * documented React Native recipe.
 */
export function didReturnToForeground(previous: AppStateStatus, next: AppStateStatus): boolean {
  return previous !== "active" && next === "active";
}

/** Last known connectivity, updated by `initReconnectRN`'s listener. Optimistic
 * until the first event arrives, so an unknown state never blocks requests. */
let lastKnownOnline = true;

export function isOnlineRN(): boolean {
  return lastKnownOnline;
}

export function isVisibleRN(): boolean {
  // React Native has no background-tab concept distinct from AppState, which
  // `initFocusRN` already covers — the foreground screen is always "visible".
  return true;
}

export function initFocusRN(callback: () => void): () => void {
  let previousState: AppStateStatus = AppState.currentState;
  const subscription = AppState.addEventListener("change", (nextState) => {
    if (didReturnToForeground(previousState, nextState)) {
      callback();
    }
    previousState = nextState;
  });
  return () => subscription.remove();
}

export function initReconnectRN(callback: () => void): () => void {
  let wasOnline = lastKnownOnline;
  const subscription = Network.addNetworkStateListener((state) => {
    const nowOnline = Boolean(state.isConnected);
    lastKnownOnline = nowOnline;
    if (nowOnline && !wasOnline) {
      callback();
    }
    wasOnline = nowOnline;
  });
  return () => subscription.remove();
}
