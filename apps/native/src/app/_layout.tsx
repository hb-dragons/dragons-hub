import structuredClonePolyfill from "@ungap/structured-clone";
import { Platform } from "react-native";
if (Platform.OS !== "web" && typeof globalThis.structuredClone !== "function") {
  (globalThis as { structuredClone?: unknown }).structuredClone = structuredClonePolyfill;
}

import { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { SWRConfig } from "swr";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { swrConfig } from "@/lib/swr-config";
import { ThemeProvider, useTheme } from "@/hooks/useTheme";
import { LocaleProvider } from "@/hooks/useLocale";
import { useBiometricLock } from "@/hooks/useBiometricLock";
import { authClient } from "@/lib/auth-client";
import { fontAssets } from "@/theme/typography";
import { i18n } from "@/lib/i18n";
import { colors as themeColors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { configureNotificationHandler } from "@/lib/push/handler";
import {
  BACK_BUTTON_DISPLAY_MODE,
  detailHeaderOptions,
  tabRootHeaderOptions,
} from "@/lib/nav/headers";
import { searchSheetOptions } from "@/lib/nav/sheet-routes";
import { installGlobalErrorHandler } from "@/lib/global-error-handler";
import { usePushRegistration } from "@/hooks/usePushRegistration";
import { ToastProvider } from "@/hooks/useToast";
import { ToastHost } from "@/components/ui/ToastHost";

void SplashScreen.preventAutoHideAsync();
configureNotificationHandler();

function RootNavigator() {
  usePushRegistration();
  const { colors, isDark } = useTheme();
  // Every screen's header options are declared here, once, so that none of
  // them is attached (or changed) after a push transition has begun. The
  // exception is a title a screen can only know from its data; those screens
  // declare that one option inline. See lib/nav/headers.ts.
  const detail = detailHeaderOptions(colors.foreground);

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          // No headerStyle background here: an explicit colour is painted as a
          // solid bar and then swapped for the system glass mid-transition,
          // which flashes (same reasoning as app/admin/_layout.tsx).
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ title: "" }} />
        <Stack.Screen name="admin" options={{ headerShown: false }} />
        <Stack.Screen name="team/[id]" options={detail} />
        <Stack.Screen name="game/[id]" options={detail} />
        <Stack.Screen name="referee-game/[id]" options={detail} />
        <Stack.Screen name="h2h/[teamApiId]" options={detail} />
        <Stack.Screen name="+not-found" options={detail} />
        {/* Referee assignment (#223): a form sheet whose native header carries
            the search field. The title names the slot, so the screen declares
            that one option itself. */}
        <Stack.Screen
          name="referee-assign"
          options={searchSheetOptions({ tintColor: colors.foreground })}
        />
        {/* The Standings tab's content, pushed: same large title, plus a back button. */}
        <Stack.Screen
          name="league-tables"
          options={tabRootHeaderOptions(i18n.t("standings.title"))}
        />
        <Stack.Screen
          name="(auth)"
          options={{
            presentation: "fullScreenModal",
            animation: "slide_from_bottom",
          }}
        />
        <Stack.Screen
          name="profile"
          options={{
            headerShown: true,
            headerTitle: i18n.t("profile.title"),
            headerTintColor: colors.foreground,
            headerBackButtonDisplayMode: BACK_BUTTON_DISPLAY_MODE,
          }}
        />
        <Stack.Screen
          name="assistant"
          options={{
            presentation: "modal",
            headerShown: true,
            headerTitle: i18n.t("assistant.title"),
            headerTintColor: colors.foreground,
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
  const { isLocked, isReady: biometricReady, authenticate } = useBiometricLock();
  const { isPending: sessionPending } = authClient.useSession();
  const [authFailed, setAuthFailed] = useState(false);

  useEffect(() => installGlobalErrorHandler(), []);

  // Gating: the authed tree must only render once every independent guard has
  // settled. Three async sources feed this decision:
  //   1. `fontsLoaded`     — expo-font has loaded custom faces.
  //   2. `!sessionPending` — better-auth has restored (or not) the session.
  //   3. `biometricReady`  — SecureStore has been read so `isLocked` is
  //                          definitive; before this flag is true, `isLocked`
  //                          defaults to `false` and would let the authed tree
  //                          render for a frame when the user actually has the
  //                          lock enabled.
  // Once all three are ready, we either show the Unlock screen (when locked
  // and auth has failed) or render the app. Splash stays up until the first
  // definitive decision is made.
  const isGateReady = fontsLoaded && !sessionPending && biometricReady;

  useEffect(() => {
    if (!isGateReady) return;

    if (isLocked) {
      void authenticate().then((success) => {
        if (!success) setAuthFailed(true);
        void SplashScreen.hideAsync();
      });
    } else {
      void SplashScreen.hideAsync();
    }
  }, [isGateReady, isLocked, authenticate]);

  if (!isGateReady) {
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <KeyboardProvider>
          <SWRConfig value={swrConfig}>
            <LocaleProvider>
              <ThemeProvider>
                <ToastProvider>
                  {/* The board's task-detail and quick-create sheets are the
                      last JS bottom sheets left; the utility sheets became
                      routes in #219, and #222/#225 finish the job. */}
                  <BottomSheetModalProvider>
                    <RootNavigator />
                    <ToastHost />
                  </BottomSheetModalProvider>
                </ToastProvider>
              </ThemeProvider>
            </LocaleProvider>
          </SWRConfig>
        </KeyboardProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
