import { Stack, useRouter } from "expo-router";
import { useLocaleSubscription } from "@/hooks/useLocale";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { dismissModal } from "@/lib/nav/dismiss-modal";
import { closeToolbar } from "@/components/nav/ProfileToolbar";

/**
 * Sign-in's stack (#396). The root presents it as a page sheet, like Profile:
 * the native header carries the title and a Close button, and swiping the
 * sheet down closes it too. A successful sign-in closes it from the screen.
 */
export default function AuthLayout() {
  useLocaleSubscription();
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: colors.foreground,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="sign-in" options={{ title: i18n.t("auth.signIn") }}>
        {closeToolbar(() => dismissModal(router))}
      </Stack.Screen>
    </Stack>
  );
}
