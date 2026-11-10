import { Pressable, Text, View } from "react-native";
import { useBiometricLock } from "@/hooks/useBiometricLock";
import { lockLabels } from "@/lib/auth/lock-method";
import { i18n, translate } from "@/lib/i18n";
import { colors as themeColors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";

/**
 * The app lock's screen (#399): the wordmark and one button naming the
 * device's method ("Mit Face ID entsperren").
 *
 * Drawn on the dark palette directly rather than through `useTheme`: on a
 * cold start it covers the app from outside the theme provider, and it should
 * read the same whichever way it is shown.
 */
export function UnlockScreen() {
  const { method, authenticate } = useBiometricLock();
  const dark = themeColors.dark;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: dark.background,
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.xl,
      }}
    >
      <Text
        accessibilityRole="header"
        accessibilityHint={i18n.t("auth.lockedHint")}
        style={{ color: dark.foreground, fontSize: 28, fontWeight: "700", letterSpacing: 2 }}
      >
        DRAGONS
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void authenticate()}
        style={{
          backgroundColor: dark.primary,
          paddingHorizontal: spacing.xl,
          paddingVertical: spacing.md,
          borderRadius: 12,
        }}
      >
        <Text style={{ color: dark.primaryForeground, fontSize: 16, fontWeight: "600" }}>
          {lockLabels(method, translate).unlock}
        </Text>
      </Pressable>
    </View>
  );
}
