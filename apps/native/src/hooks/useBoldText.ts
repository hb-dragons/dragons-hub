import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Whether iOS "Bold Text" is on, kept current while the app runs. Android
 * reports `false` (React Native exposes no Bold Text reading there), so the
 * theme's family swap is iOS-only.
 */
export function useBoldText(): boolean {
  const [boldText, setBoldText] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isBoldTextEnabled()
      .then((enabled) => {
        if (active) setBoldText(enabled);
      })
      .catch(() => {
        // Unreadable setting: keep the regular faces.
      });
    const subscription = AccessibilityInfo.addEventListener("boldTextChanged", setBoldText);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return boldText;
}
