import { useEffect, useState, useCallback } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const BIOMETRIC_KEY = "biometric_lock_enabled";

export function useBiometricLock() {
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
