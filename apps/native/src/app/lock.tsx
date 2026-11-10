import { useEffect } from "react";
import { AppState, BackHandler } from "react-native";
import { useNavigation, useRouter } from "expo-router";
import { useBiometricLock } from "@/hooks/useBiometricLock";
import { UnlockScreen } from "@/components/auth/UnlockScreen";

/**
 * The app lock after a relock (#399), presented by the root layout as a
 * full-screen modal over whatever was open, sheets included. Unlocking pops
 * it, which returns to exactly that screen.
 */
export default function LockRoute() {
  const router = useRouter();
  const navigation = useNavigation();
  const { isLocked, authenticate } = useBiometricLock();

  // Prompt once the app is in front: the relock presents this route while
  // the app is still in the background, where the system prompt cannot show.
  useEffect(() => {
    if (AppState.currentState === "active") {
      void authenticate();
      return;
    }
    let prompted = false;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active" || prompted) return;
      prompted = true;
      void authenticate();
    });
    return () => subscription.remove();
  }, [authenticate]);

  useEffect(() => {
    if (isLocked) return;
    // This screen's own `goBack`, not the router's: if something landed on
    // top while locked, the lock was pushed again over it, and every lock
    // instance must remove itself rather than pop whatever is on top.
    if (navigation.canGoBack()) navigation.goBack();
    else router.replace("/");
  }, [isLocked, navigation, router]);

  // Android's back button must not walk past the lock.
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => subscription.remove();
  }, []);

  return <UnlockScreen />;
}
