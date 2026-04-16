import { View, Text, Pressable, StyleSheet } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { authClient } from "@/lib/auth-client";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { SectionHeader } from "@/components/SectionHeader";
import { Screen } from "@/components/Screen";
import type { Mode } from "@/hooks/useTheme";

const THEME_OPTIONS: { label: string; value: Mode }[] = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
];

export default function ProfileScreen() {
  const { colors, textStyles, spacing, radius, mode, setMode } = useTheme();
  const router = useRouter();
  const { data: session } = authClient.useSession();

  async function handleSignOut() {
    await authClient.signOut();
    router.replace("/");
  }

  if (!session) {
    return (
      <>
        <Stack.Screen options={{ title: "Profile" }} />
        <Screen scroll={false}>
          <View style={styles.centeredContainer}>
            <Text
              style={[
                textStyles.sectionTitle,
                { color: colors.foreground, marginBottom: spacing.md },
              ]}
            >
              Sign in to view your profile
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
                Sign In
              </Text>
            </Pressable>
          </View>
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Profile" }} />
      <Screen>
        <View style={{ marginTop: spacing.lg, gap: spacing.xl }}>
          {/* User info card */}
          <Card>
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
                { color: colors.mutedForeground, marginBottom: spacing.md },
              ]}
            >
              {session.user.email}
            </Text>
            <Badge
              label={
                "role" in session.user && typeof session.user.role === "string"
                  ? session.user.role
                  : "member"
              }
              variant="secondary"
            />
          </Card>

          {/* Theme section */}
          <View>
            <SectionHeader title="Appearance" />
            <View style={styles.themeRow}>
              {THEME_OPTIONS.map((option) => {
                const isActive = mode === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setMode(option.value)}
                    style={[
                      styles.themeButton,
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
                      {option.label}
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
              Sign Out
            </Text>
          </Pressable>
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  centeredContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  themeRow: {
    flexDirection: "row",
    gap: 8,
  },
  themeButton: {
    flex: 1,
    alignItems: "center",
  },
});
