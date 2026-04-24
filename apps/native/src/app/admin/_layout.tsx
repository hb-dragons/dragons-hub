import { Stack, Redirect } from "expo-router";
import { hasRole } from "@dragons/shared";
import { authClient } from "@/lib/auth-client";
import { useTheme } from "@/hooks/useTheme";

export default function AdminLayout() {
  const { data: session } = authClient.useSession();
  const { colors } = useTheme();

  const user = session?.user as { role?: string | null } | null | undefined;
  if (!hasRole(user, "admin")) {
    return <Redirect href="/" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
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
