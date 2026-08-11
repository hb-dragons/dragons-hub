import { useCallback, useMemo } from "react";
import { View, Text, FlatList, ActivityIndicator, RefreshControl } from "react-native";
import { useLocalSearchParams, router, Stack } from "expo-router";
import useSWR from "swr";
import type { MatchListItem } from "@dragons/shared";
import { Screen, UNDER_NATIVE_HEADER } from "../../components/Screen";
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

  // Stable handler: MatchCardFull is memo-wrapped.
  const openMatch = useCallback((match: MatchListItem) => {
    router.push(`/game/${String(match.id)}`);
  }, []);

  const first = data?.items[0];
  const opponentName = first
    ? first.homeIsOwnClub
      ? first.guestTeamName
      : first.homeTeamName
    : null;

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
    <>
      <Stack.Screen
        options={{
          headerTitle: opponentName
            ? i18n.t("h2h.title", { opponent: opponentName })
            : "",
        }}
      />
      <Screen edges={UNDER_NATIVE_HEADER} scroll={false}>
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <FlatList
            data={data?.items ?? []}
            keyExtractor={(item) => item.id.toString()}
            // The screen's scroll view: it takes the content inset for the
            // transparent header floating over it.
            contentInsetAdjustmentBehavior="automatic"
            renderItem={({ item }) => (
              <View style={{ marginBottom: spacing.sm }}>
                <MatchCardFull match={item} onPress={openMatch} />
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
    </>
  );
}
