import { View, Text, Pressable, Switch, StyleSheet } from "react-native";
import { Stack, useRouter } from "expo-router";
import { parseRoles, isReferee, type RoleName } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { useLocale } from "@/hooks/useLocale";
import type { LocalePref } from "@/hooks/useLocale";
import { useBiometricLock } from "@/hooks/useBiometricLock";
import { authClient } from "@/lib/auth-client";
import { unregisterForPush } from "@/lib/push/registration";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { SectionHeader } from "@/components/SectionHeader";
import { Screen } from "@/components/Screen";
import { Logo } from "@/components/brand/Logo";
import { i18n } from "@/lib/i18n";
import type { Mode } from "@/hooks/useTheme";

const THEME_OPTIONS: { labelKey: string; value: Mode }[] = [
  { labelKey: "profile.themeSystem", value: "system" },
  { labelKey: "profile.themeLight", value: "light" },
  { labelKey: "profile.themeDark", value: "dark" },
];

const LOCALE_OPTIONS: { labelKey: string; value: LocalePref }[] = [
  { labelKey: "profile.languageSystem", value: "system" },
  { labelKey: "profile.languageDe", value: "de" },
  { labelKey: "profile.languageEn", value: "en" },
];

export default function ProfileScreen() {
  const { colors, textStyles, spacing, radius, mode, setMode } = useTheme();
  const { pref: localePref, setPref: setLocalePref } = useLocale();
  const { isSupported, isEnabled, toggle } = useBiometricLock();
  const router = useRouter();
  const { data: session } = authClient.useSession();

  async function handleSignOut() {
    // DELETE push token BEFORE clearing auth — the DELETE endpoint requires
    // an authenticated session to authorize the deletion.
    await unregisterForPush();
    await authClient.signOut();
    router.replace("/");
  }

  if (!session) {
    return (
      <>
        <Stack.Screen options={{ title: i18n.t("profile.title") }} />
        <Screen edges={[]}>
          <View style={{ marginTop: spacing.xl, alignItems: "center" }}>
            <Text
              style={[
                textStyles.sectionTitle,
                { color: colors.foreground, marginBottom: spacing.sm, textAlign: "center" },
              ]}
            >
              {i18n.t("auth.staffSignInPrompt")}
            </Text>
            <Text
              style={[
                textStyles.body,
                {
                  color: colors.mutedForeground,
                  marginBottom: spacing.xl,
                  textAlign: "center",
                  paddingHorizontal: spacing.lg,
                },
              ]}
            >
              {i18n.t("auth.staffSignInHint")}
            </Text>
            <Pressable
              onPress={() => router.push("/(auth)/sign-in")}
              style={{
                backgroundColor: colors.primary,
                borderRadius: radius.md,
                paddingHorizontal: spacing.xl,
                paddingVertical: spacing.md,
              }}
            >
              <Text style={[textStyles.button, { color: colors.primaryForeground }]}>
                {i18n.t("auth.signIn")}
              </Text>
            </Pressable>
          </View>

          <View style={{ marginTop: spacing.xl * 2 }}>
            <SectionHeader title={i18n.t("profile.language")} />
            <View style={styles.segmentedRow}>
              {LOCALE_OPTIONS.map((option) => {
                const isActive = localePref === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setLocalePref(option.value)}
                    style={[
                      styles.segmentedButton,
                      {
                        backgroundColor: isActive
                          ? colors.primary
                          : colors.surfaceHigh,
                        borderRadius: radius.md,
                        paddingVertical: spacing.sm,
                        paddingHorizontal: spacing.md,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        textStyles.label,
                        {
                          color: isActive
                            ? colors.primaryForeground
                            : colors.foreground,
                        },
                      ]}
                    >
                      {i18n.t(option.labelKey)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: i18n.t("profile.title") }} />
      <Screen edges={[]}>
        <View style={{ marginTop: spacing.lg, gap: spacing.xl }}>
          {/* User info card */}
          <Card>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                marginBottom: spacing.md,
              }}
            >
              <Logo size={48} />
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    textStyles.cardTitle,
                    { color: colors.foreground, marginBottom: spacing.xs },
                  ]}
                >
                  {session.user.name}
                </Text>
                <Text
                  style={[
                    textStyles.body,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {session.user.email}
                </Text>
              </View>
            </View>
            {(() => {
              const role =
                "role" in session.user && typeof session.user.role === "string"
                  ? session.user.role
                  : null;
              const roleNames = parseRoles(role);
              const showRefereeBadge = isReferee(
                session.user as { refereeId?: number | null },
              );
              if (roleNames.length === 0 && !showRefereeBadge) return null;
              const roleLabelKey: Record<RoleName, string> = {
                admin: "profile.roleAdmin",
                refereeAdmin: "profile.roleRefereeAdmin",
                venueManager: "profile.roleVenueManager",
                teamManager: "profile.roleTeamManager",
              };
              return (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
                  {roleNames.map((name) => (
                    <Badge
                      key={name}
                      label={i18n.t(roleLabelKey[name])}
                      variant="secondary"
                    />
                  ))}
                  {showRefereeBadge ? (
                    <Badge
                      label={i18n.t("profile.roleReferee")}
                      variant="secondary"
                    />
                  ) : null}
                </View>
              );
            })()}
          </Card>

          {/* Biometric lock section */}
          {isSupported && (
            <View>
              <SectionHeader title={i18n.t("profile.biometricLock")} />
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: spacing.sm,
                }}
              >
                <Text style={[textStyles.body, { color: colors.foreground }]}>
                  {i18n.t("profile.biometricLock")}
                </Text>
                <Switch
                  value={isEnabled}
                  onValueChange={() => void toggle()}
                  trackColor={{ true: colors.primary, false: undefined }}
                />
              </View>
            </View>
          )}

          {/* Theme section */}
          <View>
            <SectionHeader title={i18n.t("profile.theme")} />
            <View style={styles.segmentedRow}>
              {THEME_OPTIONS.map((option) => {
                const isActive = mode === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setMode(option.value)}
                    style={[
                      styles.segmentedButton,
                      {
                        backgroundColor: isActive
                          ? colors.primary
                          : colors.surfaceHigh,
                        borderRadius: radius.md,
                        paddingVertical: spacing.sm,
                        paddingHorizontal: spacing.md,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        textStyles.label,
                        {
                          color: isActive
                            ? colors.primaryForeground
                            : colors.foreground,
                        },
                      ]}
                    >
                      {i18n.t(option.labelKey)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Language section */}
          <View>
            <SectionHeader title={i18n.t("profile.language")} />
            <View style={styles.segmentedRow}>
              {LOCALE_OPTIONS.map((option) => {
                const isActive = localePref === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setLocalePref(option.value)}
                    style={[
                      styles.segmentedButton,
                      {
                        backgroundColor: isActive
                          ? colors.primary
                          : colors.surfaceHigh,
                        borderRadius: radius.md,
                        paddingVertical: spacing.sm,
                        paddingHorizontal: spacing.md,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        textStyles.label,
                        {
                          color: isActive
                            ? colors.primaryForeground
                            : colors.foreground,
                        },
                      ]}
                    >
                      {i18n.t(option.labelKey)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Sign Out */}
          <Pressable
            onPress={handleSignOut}
            style={{
              backgroundColor: colors.destructive + "1A",
              borderRadius: radius.md,
              padding: spacing.md,
              alignItems: "center",
            }}
          >
            <Text style={[textStyles.button, { color: colors.destructive }]}>
              {i18n.t("profile.signOut")}
            </Text>
          </Pressable>
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  segmentedRow: {
    flexDirection: "row",
    gap: 8,
  },
  segmentedButton: {
    flex: 1,
    alignItems: "center",
  },
});
