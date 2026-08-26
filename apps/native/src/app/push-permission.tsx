import { useEffect, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { Redirect, router } from "expo-router";
import { SheetScreen } from "@/components/sheets/SheetScreen";
import { authClient } from "@/lib/auth-client";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { requestPushPermissionAndRegister } from "@/lib/push/registration";
import { deferPushPrompt } from "@/lib/push/pre-prompt";

const POINTS = ["push.point1", "push.point2", "push.point3", "push.point4"] as const;

/**
 * Push pre-permission sheet (#237). Opens from `usePushRegistration` after
 * sign-in when the OS has not been asked yet, and from Profile. Every way
 * out — "Aktivieren" completing (grant or deny), "Später", swipe, back —
 * writes the per-device deferral on unmount, and the sheet closes on any
 * outcome of the OS prompt so a rejected/thrown call cannot strand the user
 * in it. A deferral written right after a grant is inert: `decidePushFlow`
 * (`lib/push/pre-prompt.ts`) checks the OS status before it ever reads the
 * deferred flag, so a granted status short-circuits to "register" and the
 * deferral is never consulted. Profile's "Mitteilungen" row is the way back
 * in — it clears the deferral before reopening the sheet.
 */
export default function PushPermissionSheet() {
  const { colors, spacing, radius, textStyles } = useTheme();
  const { data: session, isPending } = authClient.useSession();
  const mounted = useRef(true);

  useEffect(() => {
    return () => {
      mounted.current = false;
      void deferPushPrompt();
    };
  }, []);

  // Swiping the sheet away mid-registration unmounts it before the network
  // call settles; without this, `close` would pop whatever is on top instead.
  const close = () => {
    if (!mounted.current) return;
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  const enable = async () => {
    try {
      await requestPushPermissionAndRegister();
    } finally {
      close();
    }
  };

  // The OS prompt is one-shot per install, and registering needs a session.
  // A `dragons://push-permission` link opened signed out would burn it on a
  // request the API answers with a 401.
  // Checked after all hooks so the hook call order stays fixed across renders.
  if (!isPending && !session) {
    return <Redirect href="/" />;
  }

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
