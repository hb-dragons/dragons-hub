import { View, Text, FlatList, ActivityIndicator } from "react-native";
import { useLocalSearchParams, Stack, router } from "expo-router";
import useSWR from "swr";
import { Screen } from "../../components/Screen";
import { MatchCardFull } from "../../components/MatchCardFull";
import { useTheme } from "../../hooks/useTheme";
import { publicApi } from "../../lib/api";
import { i18n } from "../../lib/i18n";

export default function H2HScreen() {
  const { teamApiId } = useLocalSearchParams<{ teamApiId: string }>();
  const { colors, spacing, textStyles } = useTheme();

  const { data, isLoading } = useSWR(
    `h2h:${teamApiId}`,
    () => publicApi.getMatches({ opponentApiId: Number(teamApiId), limit: 50, sort: "desc" }),
  );

  const opponentName = data?.items[0]
    ? (data.items[0].homeIsOwnClub
        ? (data.items[0].guestTeamCustomName ?? data.items[0].guestTeamNameShort ?? data.items[0].guestTeamName)
        : (data.items[0].homeTeamCustomName ?? data.items[0].homeTeamNameShort ?? data.items[0].homeTeamName))
    : "";

  return (
    <>
      <Stack.Screen options={{ title: opponentName ? i18n.t("h2h.title", { opponent: opponentName }) : "" }} />
      <Screen scroll={false}>
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <FlatList
            data={data?.items ?? []}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <View style={{ marginBottom: spacing.sm }}>
                <MatchCardFull match={item} onPress={() => router.push(`/game/${item.id}`)} />
              </View>
            )}
            contentContainerStyle={{ padding: spacing.lg }}
            ListEmptyComponent={
              <Text style={{ ...textStyles.body, color: colors.mutedForeground, textAlign: "center", marginTop: spacing.xl }}>
                {i18n.t("schedule.noMatches")}
              </Text>
            }
          />
        )}
      </Screen>
    </>
  );
}
