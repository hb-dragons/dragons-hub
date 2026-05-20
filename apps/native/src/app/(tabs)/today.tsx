import { View, Text, Pressable } from "react-native";
import { useRouter, type Href } from "expo-router";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { authClient } from "@/lib/auth-client";
import { i18n } from "@/lib/i18n";
import { useTodayItems } from "@/lib/today/registry";

export default function TodayScreen() {
  const { colors, textStyles, spacing } = useTheme();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const user = (session?.user ?? null) as
    | { role?: string | null; refereeId?: number | null }
    | null;

  const items = useTodayItems(user);

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
    </Screen>
  );
}
