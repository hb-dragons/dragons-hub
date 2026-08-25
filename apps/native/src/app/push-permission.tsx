import { useEffect, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { SheetScreen } from "@/components/sheets/SheetScreen";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { requestPushPermissionAndRegister } from "@/lib/push/registration";
import { deferPushPrompt } from "@/lib/push/pre-prompt";

const POINTS = ["push.point1", "push.point2", "push.point3", "push.point4"] as const;

/**
 * Push pre-permission sheet (#237). Opens from `usePushRegistration` after
 * sign-in when the OS has not been asked yet, and from Profile. "Aktivieren"
 * is the only path to the OS prompt; "Später" and a swipe-dismiss both defer,
 * so the sheet never nags on the next launch.
 */
export default function PushPermissionSheet() {
  const { colors, spacing, radius, textStyles } = useTheme();
  // Anything but an explicit enable — Später, swipe, back — counts as deferral.
  const enabled = useRef(false);

  useEffect(() => {
    return () => {
      if (!enabled.current) void deferPushPrompt();
    };
  }, []);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  const enable = async () => {
    enabled.current = true;
    await requestPushPermissionAndRegister();
    close();
  };

  return (
    <SheetScreen title={i18n.t("push.title")} layout="scroll" testID="push-permission-sheet">
      <View style={{ gap: spacing.md }}>
        {POINTS.map((key) => (
          <Text key={key} style={[textStyles.body, { color: colors.foreground }]}>
            {i18n.t(key)}
          </Text>
        ))}
      </View>
      <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
        <Pressable
          accessibilityRole="button"
          onPress={() => { void enable(); }}
          style={{
            backgroundColor: colors.primary,
            borderRadius: radius.md,
            paddingVertical: spacing.md,
            alignItems: "center",
            minHeight: 48,
          }}
        >
          <Text style={[textStyles.button, { color: colors.primaryForeground }]}>
            {i18n.t("push.enable")}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={close}
          style={{ paddingVertical: spacing.md, alignItems: "center", minHeight: 44 }}
        >
          <Text style={[textStyles.button, { color: colors.mutedForeground }]}>
            {i18n.t("push.later")}
          </Text>
        </Pressable>
      </View>
    </SheetScreen>
  );
}
