import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { ThemeProvider, useTheme } from "@/hooks/useTheme";
import { fontAssets } from "@/theme/typography";
import { i18n } from "@/lib/i18n";

// Keep splash screen visible while fonts load
SplashScreen.preventAutoHideAsync();

// Initialize i18n (side-effect import)
void i18n;

function RootNavigator() {
  const { colors, isDark } = useTheme();

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.foreground,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="team/[id]" options={{ headerShown: true, title: "" }} />
        <Stack.Screen name="game/[id]" options={{ headerShown: true, title: "" }} />
        <Stack.Screen name="(auth)" options={{ presentation: "modal", headerShown: false }} />
        <Stack.Screen name="profile" options={{ headerShown: true, title: i18n.t("profile.title") }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts(fontAssets);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ThemeProvider>
      <RootNavigator />
    </ThemeProvider>
  );
}
