import { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { ThemeProvider, useTheme } from "@/hooks/useTheme";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useBiometricLock } from "@/hooks/useBiometricLock";
import { fontAssets } from "@/theme/typography";
import { i18n } from "@/lib/i18n";
import { colors as themeColors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";

// Keep splash screen visible while fonts load
SplashScreen.preventAutoHideAsync();

// Initialize i18n (side-effect import)
void i18n;

function RootNavigator() {
  const { colors, isDark } = useTheme();
  usePushNotifications();

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.background },
          headerShown: false,
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="team/[id]"
          options={{
            headerShown: true,
            headerTransparent: true,
            headerTitle: "",
            headerShadowVisible: false,
            headerTintColor: colors.foreground,
          }}
        />
        <Stack.Screen
          name="game/[id]"
          options={{
            headerShown: true,
            headerTransparent: true,
            headerTitle: "",
            headerShadowVisible: false,
            headerTintColor: colors.foreground,
          }}
        />
        <Stack.Screen
          name="h2h/[teamApiId]"
          options={{
            headerShown: true,
            headerTransparent: true,
            headerTitle: "",
            headerShadowVisible: false,
            headerTintColor: colors.foreground,
          }}
        />
        <Stack.Screen name="(auth)" options={{ presentation: "modal" }} />
        <Stack.Screen
          name="profile"
          options={{
            headerShown: true,
            headerTintColor: colors.foreground,
            headerStyle: { backgroundColor: colors.background },
            headerTitle: i18n.t("profile.title"),
          }}
        />
      </Stack>
    </>
  );
}

/** Minimal unlock screen shown when biometric authentication fails or is cancelled. */
function UnlockScreen({ onRetry }: { onRetry: () => void }) {
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
        style={{
          color: dark.foreground,
          fontSize: 28,
          fontWeight: "700",
          letterSpacing: 2,
        }}
      >
        DRAGONS
      </Text>
      <Pressable
        onPress={onRetry}
        style={{
          backgroundColor: dark.primary,
          paddingHorizontal: spacing.xl,
          paddingVertical: spacing.md,
          borderRadius: 12,
        }}
      >
        <Text style={{ color: dark.primaryForeground, fontSize: 16, fontWeight: "600" }}>
          {i18n.t("auth.tapToUnlock")}
        </Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts(fontAssets);
  const { isLocked, authenticate } = useBiometricLock();
  const [authFailed, setAuthFailed] = useState(false);

  useEffect(() => {
    if (!fontsLoaded) return;

    if (isLocked) {
      void authenticate().then((success) => {
        if (success) {
          void SplashScreen.hideAsync();
        } else {
          setAuthFailed(true);
          void SplashScreen.hideAsync();
        }
      });
    } else {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, isLocked, authenticate]);

  if (!fontsLoaded) {
    return null;
  }

  if (isLocked) {
    if (!authFailed) return null; // still showing splash
    return (
      <UnlockScreen
        onRetry={() => {
          void authenticate().then((success) => {
            if (!success) setAuthFailed(true);
          });
        }}
      />
    );
  }

  return (
    <ThemeProvider>
      <RootNavigator />
    </ThemeProvider>
  );
}
