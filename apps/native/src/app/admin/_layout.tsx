import { Stack, Redirect } from "expo-router";
import { can } from "@dragons/shared";
import { authClient } from "@/lib/auth-client";
import { useTheme } from "@/hooks/useTheme";

export default function AdminLayout() {
  const { data: session } = authClient.useSession();
  const { colors } = useTheme();

  const user = session?.user as { role?: string | null } | null | undefined;
  if (!can(user, "board", "view")) {
    return <Redirect href="/" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        // No headerStyle background: on iOS 26 an explicit opaque color is
        // painted as a solid bar and then swapped for the system glass header
        // during push transitions, which flashes. The system header adapts to
        // light/dark on its own.
        headerTintColor: colors.foreground,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="boards/index" options={{ title: "Boards" }} />
      <Stack.Screen name="boards/[id]" options={{ title: "" }} />
    </Stack>
  );
}
