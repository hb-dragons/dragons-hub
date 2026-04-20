import { useMemo } from "react";
import { View, Text, FlatList, ActivityIndicator, RefreshControl } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import useSWR from "swr";
import { Screen } from "../../components/Screen";
import { MatchCardFull } from "../../components/MatchCardFull";
import { useTheme } from "../../hooks/useTheme";
import { useRefresh } from "../../hooks/useRefresh";
import { publicApi } from "../../lib/api";
import { i18n } from "../../lib/i18n";

export default function H2HScreen() {
  const { teamApiId } = useLocalSearchParams<{ teamApiId: string }>();
  const { colors, spacing, textStyles } = useTheme();

  const { data, isLoading, mutate } = useSWR(
    `h2h:${teamApiId}`,
    () => publicApi.getMatches({ opponentApiId: Number(teamApiId), limit: 50, sort: "desc" }),
  );

  const { refreshing, onRefresh } = useRefresh(() => mutate());

  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={() => {
          void onRefresh();
        }}
        tintColor={colors.primary}
      />
    ),
    [refreshing, onRefresh, colors.primary],
  );

  const listContentStyle = useMemo(
    () => ({ padding: spacing.lg }),
    [spacing.lg],
  );

  return (
    <Screen scroll={false} headerOffset={44}>
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
          contentContainerStyle={listContentStyle}
          refreshControl={refreshControl}
          ListEmptyComponent={
            <Text style={{ ...textStyles.body, color: colors.mutedForeground, textAlign: "center", marginTop: spacing.xl }}>
              {i18n.t("schedule.noMatches")}
            </Text>
          }
        />
      )}
    </Screen>
  );
}
