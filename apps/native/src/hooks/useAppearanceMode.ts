import { useCallback, useEffect, useRef, useState } from "react";
import { Appearance, useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";

export type Mode = "system" | "light" | "dark";

const THEME_MODE_KEY = "theme_mode";

function isValidMode(value: string | null): value is Mode {
  return value === "system" || value === "light" || value === "dark";
}

export interface AppearanceMode {
  mode: Mode;
  setMode: (next: Mode) => void;
  scheme: "light" | "dark";
  loaded: boolean;
}

export function useAppearanceMode(): AppearanceMode {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<Mode>("system");
  const [loaded, setLoaded] = useState(false);
  const lastKnownDeviceScheme = useRef<"light" | "dark">(
    systemScheme === "dark" ? "dark" : "light",
  );

  if (systemScheme === "light" || systemScheme === "dark") {
    lastKnownDeviceScheme.current = systemScheme;
  }

  useEffect(() => {
    void SecureStore.getItemAsync(THEME_MODE_KEY).then((stored) => {
      const resolved: Mode = isValidMode(stored) ? stored : "system";
      if (resolved !== "system") {
        Appearance.setColorScheme(resolved);
      }
      setModeState(resolved);
      setLoaded(true);
    });
  }, []);

  const setMode = useCallback((next: Mode) => {
    if (next === "system") {
      Appearance.setColorScheme("unspecified");
    } else {
      Appearance.setColorScheme(next);
    }
    setModeState(next);
    void SecureStore.setItemAsync(THEME_MODE_KEY, next);
  }, []);

  const resolvedSystem: "light" | "dark" =
    systemScheme === "dark"
      ? "dark"
      : systemScheme === "light"
        ? "light"
        : lastKnownDeviceScheme.current;

  const scheme: "light" | "dark" = mode === "system" ? resolvedSystem : mode;

  return { mode, setMode, scheme, loaded };
}
