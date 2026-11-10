import { Stack, useRouter } from "expo-router";
import type { TabId } from "@dragons/shared";
import { useLocaleSubscription } from "@/hooks/useLocale";
import { authClient, useGateUser } from "@/lib/auth-client";
import { i18n } from "@/lib/i18n";
import { tabRootHeaderOptions } from "@/lib/nav/headers";
import { tabRootProfileAffordance } from "@/lib/nav/viewer-chrome";
import { profileToolbar } from "@/components/nav/ProfileToolbar";

/**
 * The one-screen stack a tab root sits in.
 *
 * Native tabs draw no chrome of their own, so this stack exists to give the
 * root a native header (#216). It stays one screen deep by design: everything
 * a tab pushes — game, team, head-to-head — is a route outside the tab group
 * and lands on the root stack, which covers the tab bar.
 *
 * Every tab root goes through here, Home included (#395), because this is the
 * one place the viewer's profile affordance is placed.
 *
 * Home takes the same large title as the other tabs, its tab label, not the
 * brand wordmark. A large title cannot show an image, and a wordmark as a
 * standard title left Home's bar opaque while every sibling's is clear
 * (docs/2026-11-10-ios-home-wordmark-header.md). Apple's HIG also advises
 * against titling a screen with the app's name.
 */
type Props = { tab: TabId; titleKey: string };

export function TabRootStack({ tab, titleKey }: Props) {
  // `i18n.t` reads a module singleton, so nothing here re-renders on a
  // language switch unless the component subscribes to the locale itself.
  useLocaleSubscription();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const affordance = tabRootProfileAffordance(useGateUser(), tab);
  const initial = session?.user?.name?.trim().charAt(0).toUpperCase() ?? "";

  return (
    <Stack screenOptions={tabRootHeaderOptions(i18n.t(titleKey))}>
      <Stack.Screen name="index">
        {affordance
          ? profileToolbar({ affordance, initial, onPress: () => router.push("/profile") })
          : null}
      </Stack.Screen>
    </Stack>
  );
}
