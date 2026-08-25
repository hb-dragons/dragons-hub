import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { getPushPermissionStatus, type PushPermissionStatus } from "@/lib/push/registration";
import { clearPushPromptDeferral, pushStatusLabelKey } from "@/lib/push/pre-prompt";

/**
 * "Mitteilungen" on Profile (#237): shows the OS status and routes the user to
 * the right place — the explanation sheet while the OS has not been asked,
 * the system settings otherwise (that is where iOS lets it be switched).
 * Re-reads the status when the app returns from Settings.
 */
export function PushSettingsRow() {
  const { colors, textStyles, spacing } = useTheme();
  const [status, setStatus] = useState<PushPermissionStatus | null>(null);

  const refresh = useCallback(() => {
    void getPushPermissionStatus().then(setStatus);
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const onPress = () => {
    if (status === "undetermined") {
      void clearPushPromptDeferral();
      router.push("/push-permission");
      return;
    }
    void Linking.openSettings();
  };

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={status === null}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: spacing.sm,
        minHeight: 44,
      }}
    >
      <Text style={[textStyles.body, { color: colors.foreground }]}>{i18n.t("push.settingsRow")}</Text>
      <View>
        <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
          {status ? i18n.t(pushStatusLabelKey(status)) : ""}
        </Text>
      </View>
    </Pressable>
  );
}
