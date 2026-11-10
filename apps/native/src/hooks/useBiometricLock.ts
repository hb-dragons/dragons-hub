import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as ScreenCapture from "expo-screen-capture";
import { localStorage } from "@/lib/local-storage";
import { DEFAULT_RELOCK_GRACE_PERIOD_MS, subscribeBackgroundRelock } from "@/lib/biometric-relock";
import { lockMethod, type LockMethod } from "@/lib/auth/lock-method";

const BIOMETRIC_KEY = "biometric_lock_enabled";

/** Full blur: the app-switcher preview must not be readable while the lock is on. */
const APP_SWITCHER_BLUR = 1;

interface BiometricLockValue {
  /** The device can lock with biometrics (hardware present and enrolled). */
  isSupported: boolean;
  /** The device's method, named for the toggle and the unlock button. */
  method: LockMethod | null;
  isEnabled: boolean;
  isLocked: boolean;
  /**
   * The stored preference has been read, so `isLocked` is definitive. Before
   * this, `isLocked` is `false` even when the lock is on, and gating on it
   * would let a frame of the app through.
   */
  isReady: boolean;
  authenticate: () => Promise<boolean>;
  toggle: () => Promise<void>;
}

const BiometricLockContext = createContext<BiometricLockValue | null>(null);

/**
 * The app lock's one state (#399). It used to be a hook each caller ran on its
 * own, so the Profile toggle and the root layout held separate copies:
 * switching the lock on in Profile armed nothing until the next launch. One
 * provider at the root now owns it.
 */
export function BiometricLockProvider({ children }: { children: ReactNode }) {
  const [isSupported, setIsSupported] = useState(false);
  const [method, setMethod] = useState<LockMethod | null>(null);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isReady, setIsReady] = useState(false);
  // One system prompt at a time: the cold-start prompt and the lock screen's
  // own prompt must not stack.
  const inFlight = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const [hasHardware, isEnrolled, types, stored] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        LocalAuthentication.supportedAuthenticationTypesAsync(),
        localStorage.getItem(BIOMETRIC_KEY),
      ]);
      const enabled = stored === "true";

      if (cancelled) return;
      setIsSupported(hasHardware && isEnrolled);
      setMethod(lockMethod(types, Platform.OS));
      setIsEnabled(enabled);
      setIsLocked(enabled);
      setIsReady(true);
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-arm the lock on every genuine trip to the background; see
  // `biometric-relock.ts` for the AppState semantics.
  useEffect(() => {
    if (!isEnabled) return;
    return subscribeBackgroundRelock({
      onRelock: () => setIsLocked(true),
      gracePeriodMs: DEFAULT_RELOCK_GRACE_PERIOD_MS,
    });
  }, [isEnabled]);

  // The app-switcher preview is a snapshot iOS takes as the app leaves; a
  // lock drawn from JS can land after it. The native blur covers it instead.
  // Android: none, the lock route is up before the app is shown again.
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    if (isEnabled) {
      void ScreenCapture.enableAppSwitcherProtectionAsync(APP_SWITCHER_BLUR);
    } else {
      void ScreenCapture.disableAppSwitcherProtectionAsync();
    }
  }, [isEnabled]);

  const prompt = useCallback((): Promise<boolean> => {
    if (inFlight.current) return inFlight.current;
    const pending = LocalAuthentication.authenticateAsync({ disableDeviceFallback: false })
      .then((result) => result.success)
      .finally(() => {
        inFlight.current = null;
      });
    inFlight.current = pending;
    return pending;
  }, []);

  const authenticate = useCallback(async (): Promise<boolean> => {
    const success = await prompt();
    if (success) setIsLocked(false);
    return success;
  }, [prompt]);

  const toggle = useCallback(async () => {
    if (!isEnabled) {
      // Enabling: prove the method works before relying on it.
      if (!(await prompt())) return;
      await localStorage.setItem(BIOMETRIC_KEY, "true");
      setIsEnabled(true);
    } else {
      await localStorage.setItem(BIOMETRIC_KEY, "false");
      setIsEnabled(false);
      setIsLocked(false);
    }
  }, [isEnabled, prompt]);

  const value = useMemo<BiometricLockValue>(
    () => ({ isSupported, method, isEnabled, isLocked, isReady, authenticate, toggle }),
    [isSupported, method, isEnabled, isLocked, isReady, authenticate, toggle],
  );

  return createElement(BiometricLockContext.Provider, { value }, children);
}

export function useBiometricLock(): BiometricLockValue {
  const ctx = useContext(BiometricLockContext);
  if (ctx === null) {
    throw new Error("useBiometricLock must be used within a BiometricLockProvider");
  }
  return ctx;
}
