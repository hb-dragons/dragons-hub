import { View, Text, Pressable } from "react-native";
import { useRouter, type Href } from "expo-router";
import {
  visibleSurfaces,
  SURFACE_GROUP_ORDER,
  type SurfaceGroup,
} from "@dragons/shared";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { authClient } from "@/lib/auth-client";
import { i18n } from "@/lib/i18n";
import { NATIVE_SURFACES } from "@/lib/tools/surfaces";

const GROUP_LABEL: Record<SurfaceGroup, string> = {
  league: "tools.groupLeague",
  operations: "tools.groupOperations",
  social: "tools.groupSocial",
  notifications: "tools.groupNotifications",
  system: "tools.groupSystem",
};

export default function ToolsScreen() {
  const { colors, textStyles, spacing } = useTheme();
  const router = useRouter();
  const { data: session } = authClient.useSession();

  const user = (session?.user ?? null) as
    | { role?: string | null; refereeId?: number | null }
    | null;

  // Surfaces the user can see AND that have a native screen.
  const rows = visibleSurfaces(user)
    .map((s) => NATIVE_SURFACES[s.id])
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  const byGroup = SURFACE_GROUP_ORDER.map((group) => ({
    group,
    items: rows.filter((r) => r.group === group),
  })).filter((g) => g.items.length > 0);

  if (byGroup.length === 0) {
    return (
      <Screen>
        <SectionHeader title={i18n.t("tools.title")} />
        <Text style={[textStyles.body, { color: colors.mutedForeground }]}>
          {i18n.t("tools.empty")}
        </Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <SectionHeader title={i18n.t("tools.title")} />
      <View style={{ gap: spacing.lg }}>
        {byGroup.map(({ group, items }) => (
          <View key={group} style={{ gap: spacing.sm }}>
            <Text
              style={[
                textStyles.sectionTitle,
                { color: colors.mutedForeground },
              ]}
            >
              {i18n.t(GROUP_LABEL[group]).toUpperCase()}
            </Text>
            {items.map((item) => (
              <Pressable key={item.id} onPress={() => router.push(item.route as Href)}>
                <Card>
                  <Text style={[textStyles.cardTitle, { color: colors.foreground }]}>
                    {i18n.t(item.labelKey)}
                  </Text>
                </Card>
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </Screen>
  );
}
