import { useCallback, useEffect, useState } from "react";
import { Alert, AppState, Linking, Pressable, Text, View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { Screen, UNDER_NATIVE_HEADER } from "@/components/Screen";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsGroup";
import { i18n } from "@/lib/i18n";
import {
  getPushPermissionStatus,
  requestPushPermissionAndRegister,
  type PushPermissionStatus,
} from "@/lib/push/registration";
import { PUSH_POINTS, notificationsAction, pushStatusLabelKey } from "@/lib/push/pre-prompt";

/**
 * Mitteilungen, pushed inside the Profile sheet (#398). Shows the OS status
 * and what the club sends, and offers the one step that applies: the OS
 * prompt while it has not been asked, the system settings afterwards (that is
 * where iOS lets the switch be flipped). It replaces Profile's old row, which
 * opened the pre-permission sheet on top of Profile.
 *
 * Re-reads the status when the app returns from Settings, and after the
 * prompt answers.
 */
export default function ProfileNotificationsScreen() {
  const { colors, textStyles, spacing, radius } = useTheme();
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

  const action = notificationsAction(status);

  const onPress = () => {
    if (action === "request") {
      void requestPushPermissionAndRegister().finally(refresh);
      return;
    }
    // A rejected open must say so instead of leaving the button looking dead.
    void Linking.openSettings().catch(() => Alert.alert(i18n.t("legal.openFailed")));
  };

  return (
    <Screen edges={UNDER_NATIVE_HEADER}>
      <View style={{ marginTop: spacing.lg, gap: spacing.xl }}>
        <SettingsGroup>
          <SettingsRow
            label={i18n.t("push.settingsRow")}
            value={status ? i18n.t(pushStatusLabelKey(status)) : undefined}
          />
        </SettingsGroup>

        <View style={{ gap: spacing.md }}>
          {PUSH_POINTS.map((key) => (
            <Text key={key} style={[textStyles.body, { color: colors.mutedForeground }]}>
              {i18n.t(key)}
            </Text>
          ))}
        </View>

        {action ? (
          <Pressable
            accessibilityRole="button"
            onPress={onPress}
            style={{
              backgroundColor: colors.primary,
              borderRadius: radius.md,
              padding: spacing.md,
              alignItems: "center",
            }}
          >
            <Text style={[textStyles.button, { color: colors.primaryForeground }]}>
              {i18n.t(action === "request" ? "push.enable" : "push.openSettings")}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}
