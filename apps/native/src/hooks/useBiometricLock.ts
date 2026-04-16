import { useEffect, useState, useCallback } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const BIOMETRIC_KEY = "biometric_lock_enabled";

export function useBiometricLock() {
  const [isSupported, setIsSupported] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    async function init() {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      setIsSupported(hasHardware && isEnrolled);

      const stored = await SecureStore.getItemAsync(BIOMETRIC_KEY);
      const enabled = stored === "true";
      setIsEnabled(enabled);
      if (enabled) {
        setIsLocked(true);
      }
    }

    void init();
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

  return { isEnabled, isLocked, isSupported, authenticate, toggle };
}
