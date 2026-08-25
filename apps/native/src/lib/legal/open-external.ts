import { Alert, Linking } from "react-native";
import { i18n } from "@/lib/i18n";

/**
 * Opens a web or mailto URL in the system handler. A device without a mail
 * client rejects the mailto; the alert says so instead of failing silently.
 * The one call site of `Linking.openURL` for the legal links (spec §Error
 * handling), so every link fails the same way.
 */
export function openExternal(url: string): void {
  Linking.openURL(url).catch(() => {
    Alert.alert(i18n.t("legal.openFailed"));
  });
}
