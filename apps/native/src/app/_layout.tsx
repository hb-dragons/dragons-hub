import structuredClonePolyfill from "@ungap/structured-clone";
import { Platform } from "react-native";
if (Platform.OS !== "web" && typeof globalThis.structuredClone !== "function") {
  (globalThis as { structuredClone?: unknown }).structuredClone = structuredClonePolyfill;
}

import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Stack, usePathname, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { SWRConfig } from "swr";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { swrConfig } from "@/lib/swr-config";
import { ThemeProvider, useTheme } from "@/hooks/useTheme";
import { LocaleProvider } from "@/hooks/useLocale";
import { BiometricLockProvider, useBiometricLock } from "@/hooks/useBiometricLock";
import { authClient } from "@/lib/auth-client";
import { sessionGateSettled } from "@/lib/auth/session-gate";
import { LOCK_PATH, lockPresentation, lockRoutePush } from "@/lib/auth/lock-presentation";
import { UnlockScreen } from "@/components/auth/UnlockScreen";
import { fontAssets } from "@/theme/typography";
import { i18n } from "@/lib/i18n";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { configureNotificationHandler } from "@/lib/push/handler";
import { detailHeaderOptions, tabRootHeaderOptions } from "@/lib/nav/headers";
import { formSheetOptions, searchSheetOptions } from "@/lib/nav/sheet-routes";
import { installGlobalErrorHandler } from "@/lib/error-reporting";
import { initCrashReporting } from "@/lib/crash-reporting";
import { usePushRegistration } from "@/hooks/usePushRegistration";
import { ToastProvider } from "@/hooks/useToast";
import { ToastHost } from "@/components/ui/ToastHost";

void SplashScreen.preventAutoHideAsync();
configureNotificationHandler();
// At module scope, not in an effect: an error thrown while the first render
// tree is being built happens before any effect runs, and that is exactly the
// class of crash release builds hide. A no-op wherever no DSN is compiled in.
initCrashReporting();

/**
 * Presents the lock route when a relock arrives over a shown app (#399), so
 * it covers whatever is open, sheets included, and again over anything that
 * lands on top of it while locked. The route dismisses itself on unlock
 * (app/lock.tsx).
 */
function useLockRoute(present: boolean) {
  const router = useRouter();
  const pathname = usePathname();
  const pushedOver = useRef<string | null>(null);
  useEffect(() => {
    if (!present) {
      pushedOver.current = null;
      return;
    }
    if (!lockRoutePush({ present, pathname, pushedOver: pushedOver.current })) return;
    pushedOver.current = pathname;
    router.push(LOCK_PATH);
  }, [present, pathname, router]);
}

function RootNavigator({ presentLock }: { presentLock: boolean }) {
  usePushRegistration();
  useLockRoute(presentLock);
  const { colors, isDark } = useTheme();
  // Every screen's header options are declared here, once, so that none of
  // them is attached (or changed) after a push transition has begun. The
  // exception is a title a screen can only know from its data; those screens
  // declare that one option inline. See lib/nav/headers.ts.
  const detail = detailHeaderOptions({
    tintColor: colors.foreground,
    backgroundColor: colors.background,
    os: Platform.OS,
  });

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
        {/* Profile (#398): a page sheet with its own stack (app/profile/_layout.tsx),
            which draws the header and the Done button. */}
        <Stack.Screen name="profile" options={{ presentation: "modal" }} />
        {/* The app lock after a relock (#399): over everything, sheets
            included, with nothing to swipe away and no frame of animation
            showing what is underneath. */}
        <Stack.Screen
          name="lock"
          options={{ presentation: "fullScreenModal", animation: "none", gestureEnabled: false }}
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
        {/* Push pre-permission (#237): a form sheet the sign-in flow opens once
            when the OS has not been asked yet. */}
        <Stack.Screen
          name="push-permission"
          options={formSheetOptions({ name: "push-permission", detents: [0.5, 1] })}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <BiometricLockProvider>
      <RootGate />
    </BiometricLockProvider>
  );
}

function RootGate() {
  const [fontsLoaded] = useFonts(fontAssets);
  const { isLocked, isReady: lockReady, authenticate } = useBiometricLock();
  const { isPending: sessionPending } = authClient.useSession();
  const [authFailed, setAuthFailed] = useState(false);
  // Latched: a signed-out foreground refetch reports pending again, and
  // gating on the live flag unmounted the navigator (see session-gate.ts).
  const [sessionSettled, setSessionSettled] = useState(false);
  const nextSessionSettled = sessionGateSettled(sessionSettled, sessionPending);
  if (nextSessionSettled !== sessionSettled) setSessionSettled(nextSessionSettled);

  useEffect(() => installGlobalErrorHandler(), []);

  // The gate: three async sources must settle once before the app renders.
  //   1. `fontsLoaded` — expo-font has loaded the custom faces.
  //   2. `sessionSettled` — better-auth has restored (or not) the session
  //      once; later refetches do not re-close the gate.
  //   3. `lockReady` — the lock preference has been read, so `isLocked` is
  //      definitive (before that it reads `false` even with the lock on).
  // All three only ever settle, so once open the gate stays open and the
  // navigator is never unmounted again. The lock is drawn over it instead
  // (#399, lib/auth/lock-presentation.ts).
  const isGateReady = fontsLoaded && nextSessionSettled && lockReady;

  // Latched like the session: the app has been shown unlocked once, so a
  // later lock is a relock and is presented as a route over what is open.
  const [revealed, setRevealed] = useState(false);
  const presentation = lockPresentation({ gateReady: isGateReady, locked: isLocked, authFailed, revealed });
  if (presentation === "app" && !revealed) setRevealed(true);
  // A failed cold-start prompt only matters until the first unlock.
  if (presentation === "app" && authFailed) setAuthFailed(false);

  // Cold start with the lock on: prompt once, under the splash.
  const coldPrompted = useRef(false);
  useEffect(() => {
    if (!isGateReady || !isLocked || revealed || coldPrompted.current) return;
    coldPrompted.current = true;
    void authenticate().then((success) => {
      if (!success) setAuthFailed(true);
    });
  }, [isGateReady, isLocked, revealed, authenticate]);

  useEffect(() => {
    if (presentation !== "splash") void SplashScreen.hideAsync();
  }, [presentation]);

  if (!isGateReady) return null;

  // While the splash or the cold-start overlay covers the app, it is also
  // hidden from VoiceOver. The relock route needs no such flag: a full-screen
  // presentation takes the screen underneath out of the hierarchy.
  const covered = presentation === "splash" || presentation === "overlay";

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View
        style={{ flex: 1 }}
        accessibilityElementsHidden={covered}
        importantForAccessibility={covered ? "no-hide-descendants" : "auto"}
      >
        <ErrorBoundary>
          <KeyboardProvider>
            <SWRConfig value={swrConfig}>
              <LocaleProvider>
                <ThemeProvider>
                  <ToastProvider>
                    {/* No sheet provider: every sheet in the app is a route with
                        a native presentation, so the system owns the sheet layer
                        (#219, #222, #223, #225). */}
                    <RootNavigator presentLock={presentation === "route"} />
                    <ToastHost />
                  </ToastProvider>
                </ThemeProvider>
              </LocaleProvider>
            </SWRConfig>
          </KeyboardProvider>
        </ErrorBoundary>
      </View>
      {presentation === "overlay" ? (
        <View style={StyleSheet.absoluteFill}>
          <UnlockScreen />
        </View>
      ) : null}
    </GestureHandlerRootView>
  );
}
