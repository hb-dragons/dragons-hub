import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { Screen, UNDER_NATIVE_HEADER } from "@/components/Screen";
import { i18n } from "@/lib/i18n";

/**
 * expo-router's fallback for a path no route matches.
 *
 * Deep links arrive from push payloads rendered by the API, so a stale or
 * mistyped link is a real possibility (a referee-slots push shipped
 * `/(tabs)/referee`, which never existed). Landing here instead of on the
 * built-in unmatched screen gives the user a way back into the app.
 */
export default function NotFoundScreen() {
  const { colors, textStyles, spacing, radius } = useTheme();
  const router = useRouter();

  function goHome(): void {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/");
  }

  return (
    <Screen edges={UNDER_NATIVE_HEADER} scroll={false}>
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: spacing.md,
          paddingHorizontal: spacing.lg,
        }}
      >
        <Text
          style={[
            textStyles.screenTitle,
            { color: colors.foreground, textAlign: "center" },
          ]}
        >
          {i18n.t("notFound.title")}
        </Text>
        <Text
          style={[
            textStyles.body,
            { color: colors.mutedForeground, textAlign: "center", maxWidth: 320 },
          ]}
        >
          {i18n.t("notFound.body")}
        </Text>
        <Pressable
          onPress={goHome}
          accessibilityRole="button"
          style={{
            backgroundColor: colors.primary,
            paddingHorizontal: spacing.xl,
            paddingVertical: spacing.md,
            borderRadius: radius.md,
            marginTop: spacing.sm,
          }}
        >
          <Text style={[textStyles.body, { color: colors.primaryForeground }]}>
            {i18n.t("notFound.action")}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
