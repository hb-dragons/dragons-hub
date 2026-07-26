import { useEffect, useState, useCallback } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { DEFAULT_RELOCK_GRACE_PERIOD_MS, subscribeBackgroundRelock } from "@/lib/biometric-relock";

const BIOMETRIC_KEY = "biometric_lock_enabled";

export function useBiometricLock(options?: { relockGracePeriodMs?: number }) {
  const relockGracePeriodMs = options?.relockGracePeriodMs ?? DEFAULT_RELOCK_GRACE_PERIOD_MS;
  const [isSupported, setIsSupported] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  // `isReady` stays false until we've read SecureStore and know whether the
  // app should start in the locked state. Without this, callers see
  // `isLocked === false` for the first render pass even when biometric is
  // enabled, which lets the authed tree render for a frame before the async
  // init flips the lock on.
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const stored = await SecureStore.getItemAsync(BIOMETRIC_KEY);
      const enabled = stored === "true";

      if (cancelled) return;
      setIsSupported(hasHardware && isEnrolled);
      setIsEnabled(enabled);
      setIsLocked(enabled);
      setIsReady(true);
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-arm the lock: `isLocked` above only reflects the mount-time read of
  // SecureStore, so without this the lock protects nothing after the first
  // unlock — backgrounding the app and returning re-enters the authed tree
  // with no prompt for the rest of the process lifetime. Only a genuine
  // `background` (not iOS's transient `inactive`) counts; see
  // `biometric-relock.ts` for the AppState semantics.
  useEffect(() => {
    if (!isEnabled) return;
    return subscribeBackgroundRelock({
      onRelock: () => setIsLocked(true),
      gracePeriodMs: relockGracePeriodMs,
    });
  }, [isEnabled, relockGracePeriodMs]);

  const authenticate = useCallback(async (): Promise<boolean> => {
    const result = await LocalAuthentication.authenticateAsync({
      disableDeviceFallback: false,
    });
    if (result.success) {
      setIsLocked(false);
    }
    return result.success;
  }, []);

  const toggle = useCallback(async () => {
    if (!isEnabled) {
      // Enabling: verify biometric first
      const result = await LocalAuthentication.authenticateAsync({
        disableDeviceFallback: false,
      });
      if (!result.success) return;
      await SecureStore.setItemAsync(BIOMETRIC_KEY, "true");
      setIsEnabled(true);
    } else {
      // Disabling
      await SecureStore.setItemAsync(BIOMETRIC_KEY, "false");
      setIsEnabled(false);
      setIsLocked(false);
    }
  }, [isEnabled]);

  return { isEnabled, isLocked, isSupported, isReady, authenticate, toggle };
}
