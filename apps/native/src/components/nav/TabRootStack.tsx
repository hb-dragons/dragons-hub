import { Stack } from "expo-router";
import { useLocaleSubscription } from "@/hooks/useLocale";
import { i18n } from "@/lib/i18n";
import { tabRootHeaderOptions } from "@/lib/nav/headers";

/**
 * The one-screen stack a tab root sits in.
 *
 * Native tabs draw no chrome of their own, so this stack exists purely to give
 * the root a native collapsing large title (#216). It stays one screen deep by
 * design: everything a tab pushes — game, team, head-to-head — is a route
 * outside the tab group and lands on the root stack, which covers the tab bar.
 *
 * Home has no equivalent. It keeps its chrome-less wordmark layout.
 */
export function TabRootStack({ titleKey }: { titleKey: string }) {
  // `i18n.t` reads a module singleton, so nothing here re-renders on a
  // language switch unless the component subscribes to the locale itself.
  useLocaleSubscription();

  return <Stack screenOptions={tabRootHeaderOptions(i18n.t(titleKey))} />;
}
