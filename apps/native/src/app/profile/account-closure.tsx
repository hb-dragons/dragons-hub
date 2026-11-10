import { useState } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import { router } from "expo-router";
import { useSWRConfig } from "swr";
import { useTheme } from "@/hooks/useTheme";
import { useToast } from "@/hooks/useToast";
import { ACCOUNT_CLOSURE_KEY, useAccountClosure } from "@/hooks/useAccountClosure";
import { Screen, UNDER_NATIVE_HEADER } from "@/components/Screen";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsGroup";
import { meApi } from "@/lib/api";
import { haptics } from "@/lib/haptics";
import { i18n } from "@/lib/i18n";
import { closureRequestedDate, closureScreenState, confirmAccountClosure } from "@/lib/account/closure";

/**
 * Konto löschen, pushed inside the Profile sheet (#400, ADR-0013). The club
 * created the account and manages it, so this screen asks the club to close it:
 * it says so, says the referee and staff person records stay, and sends the
 * request behind a destructive confirm. The API mails the club; the device
 * needs no Mail account. Once the request is on file, Profile and this screen
 * show the day it was made instead of the action.
 */
export default function AccountClosureScreen() {
  const { colors, textStyles, spacing } = useTheme();
  const { data, error } = useAccountClosure();
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const state = closureScreenState({ status: data, error, submitting });

  const request = async () => {
    setSubmitting(true);
    try {
      const status = await meApi.requestAccountClosure();
      await mutate(ACCOUNT_CLOSURE_KEY, status, { revalidate: false });
      haptics.success();
      // Back to Profile, whose last row now names the day.
      router.back();
    } catch {
      haptics.error();
      toast.show({ title: i18n.t("profile.closure.sendFailed"), variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const body = (key: string) => (
    <Text style={[textStyles.body, { color: colors.mutedForeground }]}>{i18n.t(key)}</Text>
  );

  return (
    <Screen edges={UNDER_NATIVE_HEADER}>
      <View style={{ marginTop: spacing.lg, gap: spacing.xl }}>
        <View style={{ gap: spacing.md }}>
          {body("profile.closure.intro")}
          {body("profile.closure.recordsStay")}
          {body("profile.closure.process")}
        </View>

        {state === "loading" ? <ActivityIndicator /> : null}
        {state === "failed" ? (
          <Text style={[textStyles.body, { color: colors.destructive }]}>
            {i18n.t("profile.closure.loadFailed")}
          </Text>
        ) : null}
        {state === "ready" || state === "submitting" ? (
          <SettingsGroup>
            <SettingsRow
              destructive
              label={i18n.t("profile.closure.action")}
              accessory={state === "submitting" ? <ActivityIndicator /> : undefined}
              onPress={
                state === "ready"
                  ? () =>
                      confirmAccountClosure({
                        alert: (title, message, buttons) => Alert.alert(title, message, buttons),
                        request,
                        t: (key) => i18n.t(key),
                      })
                  : undefined
              }
            />
          </SettingsGroup>
        ) : null}
        {state === "requested" && data?.request ? (
          <View style={{ gap: spacing.md }}>
            <SettingsGroup>
              <SettingsRow
                label={i18n.t("profile.closure.requested", {
                  date: closureRequestedDate(data.request.requestedAt, i18n.locale),
                })}
              />
            </SettingsGroup>
            {body("profile.closure.requestedHint")}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
