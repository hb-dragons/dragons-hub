import { View } from "react-native";
import { Stack, useRouter } from "expo-router";
import type { TabId } from "@dragons/shared";
import { useLocaleSubscription } from "@/hooks/useLocale";
import { authClient, useGateUser } from "@/lib/auth-client";
import { i18n } from "@/lib/i18n";
import { homeHeaderOptions, tabRootHeaderOptions } from "@/lib/nav/headers";
import { tabRootProfileAffordance } from "@/lib/nav/viewer-chrome";
import { Wordmark } from "@/components/brand/Wordmark";
import { profileToolbar } from "@/components/nav/ProfileToolbar";

/** Wide enough to read as the brand, short enough for a standard bar. */
const HOME_WORDMARK_WIDTH = 108;

function HomeTitle() {
  // The wordmark is an image; VoiceOver reads the club's name for it.
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={i18n.t("common.appName")}>
      <Wordmark width={HOME_WORDMARK_WIDTH} />
    </View>
  );
}

/**
 * The one-screen stack a tab root sits in.
 *
 * Native tabs draw no chrome of their own, so this stack exists to give the
 * root a native header (#216). It stays one screen deep by design: everything
 * a tab pushes — game, team, head-to-head — is a route outside the tab group
 * and lands on the root stack, which covers the tab bar.
 *
 * Every tab root goes through here, Home included (#395), because this is the
 * one place the viewer's profile affordance is placed. Home's header shows
 * the wordmark instead of a large title, so it takes no title key.
 */
type Props = { tab: "home" } | { tab: Exclude<TabId, "home">; titleKey: string };

export function TabRootStack(props: Props) {
  const { tab } = props;
  // `i18n.t` reads a module singleton, so nothing here re-renders on a
  // language switch unless the component subscribes to the locale itself.
  useLocaleSubscription();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const affordance = tabRootProfileAffordance(useGateUser(), tab);
  const initial = session?.user?.name?.trim().charAt(0).toUpperCase() ?? "";

  const screenOptions =
    props.tab === "home"
      ? homeHeaderOptions(HomeTitle)
      : tabRootHeaderOptions(i18n.t(props.titleKey));

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index">
        {affordance
          ? profileToolbar({ affordance, initial, onPress: () => router.push("/profile") })
          : null}
      </Stack.Screen>
    </Stack>
  );
}
