import { Stack, useRouter } from "expo-router";
import { useLocaleSubscription } from "@/hooks/useLocale";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { BACK_BUTTON_DISPLAY_MODE } from "@/lib/nav/headers";
import { dismissModal } from "@/lib/nav/dismiss-modal";
import { doneToolbar } from "@/components/nav/ProfileToolbar";

/**
 * Profile's own stack (#398). The root presents it as a page sheet; contact
 * data and notifications push inside it, so a row never opens a second sheet
 * on top of the first. The first screen carries Done, which closes the sheet
 * (swiping it down does the same).
 */
/**
 * A cold deep link to `/profile/contact` or `/profile/notifications` still
 * puts Profile under it, so the screen has a back button to Profile and Done
 * from there — Android has no swipe to close the sheet.
 */
export const unstable_settings = { initialRouteName: "index" };

export default function ProfileLayout() {
  // `i18n.t` reads a module singleton; titles follow a language switch only if
  // the layout re-renders on it.
  useLocaleSubscription();
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: colors.foreground,
        headerBackButtonDisplayMode: BACK_BUTTON_DISPLAY_MODE,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: i18n.t("profile.title") }}>
        {doneToolbar(() => dismissModal(router))}
      </Stack.Screen>
      <Stack.Screen name="contact" options={{ title: i18n.t("profile.contact.title") }} />
      <Stack.Screen name="notifications" options={{ title: i18n.t("push.settingsRow") }} />
      <Stack.Screen name="account-closure" options={{ title: i18n.t("profile.closure.title") }} />
    </Stack>
  );
}
