import { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { ThemeProvider, useTheme } from "@/hooks/useTheme";
import { LocaleProvider } from "@/hooks/useLocale";
import { useBiometricLock } from "@/hooks/useBiometricLock";
import { authClient } from "@/lib/auth-client";
import { fontAssets } from "@/theme/typography";
import { i18n } from "@/lib/i18n";
import { colors as themeColors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";

SplashScreen.preventAutoHideAsync();

void i18n;

// Install a global JS error handler that logs to NSLog BEFORE RCTFatal aborts
// the app in Release builds. Readable via `idevicesyslog | grep DRAGONS_JS_ERROR`.
const existingHandler = ErrorUtils.getGlobalHandler();
ErrorUtils.setGlobalHandler((error, isFatal) => {
  const err = error as Error | undefined;
  // eslint-disable-next-line no-console
  console.warn(
    `DRAGONS_JS_ERROR fatal=${String(isFatal)} name=${err?.name} msg=${err?.message} stack=${err?.stack?.split("\n").slice(0, 8).join(" | ")}`,
  );
  existingHandler(error, isFatal);
});

const detailHeaderOptions = {
  headerShown: true,
  headerTransparent: true,
  headerTitle: "",
  headerBackTitle: "",
  headerShadowVisible: false,
  headerBackTitleStyle: { fontSize: 0 },
} as const;

function RootNavigator() {
  const { colors, isDark } = useTheme();

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          headerTintColor: colors.foreground,
          headerStyle: { backgroundColor: "transparent" },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ title: "" }} />
        <Stack.Screen name="team/[id]" options={detailHeaderOptions} />
        <Stack.Screen name="game/[id]" options={detailHeaderOptions} />
        <Stack.Screen name="referee-game/[id]" options={detailHeaderOptions} />
        <Stack.Screen name="h2h/[teamApiId]" options={detailHeaderOptions} />
        <Stack.Screen name="(auth)" options={{ presentation: "modal" }} />
        <Stack.Screen
          name="profile"
          options={{
            headerShown: true,
            headerTitle: i18n.t("profile.title"),
            headerStyle: { backgroundColor: colors.background },
          }}
        />
      </Stack>
    </>
  );
}

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
  const { isPending: sessionPending } = authClient.useSession();
  const [authFailed, setAuthFailed] = useState(false);

  useEffect(() => {
    if (!fontsLoaded || sessionPending) return;

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
  }, [fontsLoaded, sessionPending, isLocked, authenticate]);

  if (!fontsLoaded || sessionPending) {
    return null;
  }

  if (isLocked) {
    if (!authFailed) return null;
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
    <LocaleProvider>
      <ThemeProvider>
        <RootNavigator />
      </ThemeProvider>
    </LocaleProvider>
  );
}
