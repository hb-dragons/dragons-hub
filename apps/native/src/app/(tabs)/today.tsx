import { View, Text, Pressable } from "react-native";
import { useRouter, type Href } from "expo-router";
import { visibleSurfaces } from "@dragons/shared";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { useGateUser } from "@/lib/auth-client";
import { i18n } from "@/lib/i18n";
import { useTodayItems } from "@/lib/today/registry";
import { NATIVE_SURFACES } from "@/lib/tools/surfaces";

export default function TodayScreen() {
  const { colors, textStyles, spacing } = useTheme();
  const router = useRouter();
  const user = useGateUser();
  const items = useTodayItems(user);

  // Native tool surfaces the user can see (boards, future tools). Officiating
  // is excluded: it is its own tab.
  const tools = visibleSurfaces(user)
    .map((s) => NATIVE_SURFACES[s.id])
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  return (
    <Screen>
      <SectionHeader title={i18n.t("today.title")} />
      {items.length === 0 ? (
        <View style={{ marginTop: spacing.lg, gap: spacing.xs }}>
          <Text style={[textStyles.body, { color: colors.foreground }]}>
            {i18n.t("today.empty")}
          </Text>
          <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
            {i18n.t("today.emptyHint")}
          </Text>
        </View>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {items.map((item) => (
            <Pressable
              key={`${item.providerId}:${item.id}`}
              onPress={() => router.push(item.route as Href)}
            >
              <Card>
                <Text style={[textStyles.cardTitle, { color: colors.foreground }]}>
                  {item.title}
                </Text>
                {item.subtitle ? (
                  <Text
                    style={[textStyles.caption, { color: colors.mutedForeground }]}
                  >
                    {item.subtitle}
                  </Text>
                ) : null}
              </Card>
            </Pressable>
          ))}
        </View>
      )}
      {tools.length > 0 ? (
        <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
          <SectionHeader title={i18n.t("tools.title")} />
          {tools.map((tool) => (
            <Card key={tool.id} onPress={() => router.push(tool.route as Href)}>
              <Text style={[textStyles.cardTitle, { color: colors.foreground }]}>
                {i18n.t(tool.labelKey)}
              </Text>
            </Card>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
