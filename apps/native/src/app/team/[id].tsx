import { useCallback, useMemo } from "react";
import { View, Text, ActivityIndicator, FlatList, RefreshControl } from "react-native";
import type { ListRenderItem } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import useSWR from "swr";
import type { MatchListItem } from "@dragons/shared";
import {
  buildTeamsByApiId,
  findLeagueStandingsForTeam,
  getNativeTeamColor,
} from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { useRefresh } from "@/hooks/useRefresh";
import { Screen, UNDER_NATIVE_HEADER } from "@/components/Screen";
import { ErrorState } from "@/components/ErrorState";
import { MatchCardFull } from "@/components/MatchCardFull";
import { MatchCardCompact } from "@/components/MatchCardCompact";
import { FormStrip } from "@/components/FormStrip";
import { StandingsTable } from "@/components/StandingsTable";
import { ClubLogo } from "@/components/brand/ClubLogo";
import { publicApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";
import { resolveFetchState } from "@/lib/ui/fetch-state";
import { fontFamilies } from "@/theme/typography";

export default function TeamDetailScreen() {
  const { colors, textStyles, spacing, radius, isDark } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // --- Data fetching ---

  const {
    data: teams,
    error: teamsError,
    isLoading: teamsLoading,
    mutate: mutateTeams,
  } = useSWR("teams:all", () => publicApi.getTeams());

  const team = teams?.find((t) => String(t.id) === id) ?? null;

  // Built before the loading and error branches, and rendered by all three:
  // attaching header options only once the team list arrives reconfigures the
  // native header mid push-transition, which flashes a header overlay.
  const header = <Stack.Screen options={{ headerTitle: team?.name ?? "" }} />;

  const {
    data: teamStats,
    isLoading: statsLoading,
    mutate: mutateStats,
  } = useSWR(
    team ? `team:${String(team.id)}:stats` : null,
    () => publicApi.getTeamStats(Number(id)),
  );

  const {
    data: matchesData,
    isLoading: matchesLoading,
    mutate: mutateMatches,
  } = useSWR(
    team ? `team:${String(team.id)}:matches` : null,
    () =>
      publicApi.getMatches({
        teamApiId: team!.apiTeamPermanentId,
        limit: 50,
        sort: "asc",
      }),
  );

  const { data: standingsData, mutate: mutateStandings } = useSWR(
    "standings:all",
    () => publicApi.getStandings(),
  );

  // --- Derived data ---

  const allMatches = matchesData?.items ?? [];

  const { lastGame, nextGame } = useMemo(() => {
    const past: MatchListItem[] = [];
    const future: MatchListItem[] = [];

    for (const m of allMatches) {
      if (m.homeScore !== null && m.guestScore !== null) {
        past.push(m);
      } else {
        future.push(m);
      }
    }

    return {
      lastGame: past.length > 0 ? past[past.length - 1]! : null,
      nextGame: future.length > 0 ? future[0]! : null,
    };
  }, [allMatches]);

  // Find league standings for this team. Matched on the permanent api id:
  // squad names repeat across leagues, so a name match showed a table the team
  // is not in (the U12 page listed the U14 league).
  const leagueStandings = useMemo(
    () => findLeagueStandingsForTeam(standingsData, team?.apiTeamPermanentId),
    [standingsData, team],
  );

  const teamColor = getNativeTeamColor(
    team?.badgeColor,
    team?.name ?? "",
    isDark,
  );

  const teamsByApiId = useMemo(() => buildTeamsByApiId(teams), [teams]);

  const teamColorMap = useMemo(() => {
    const map: Record<number, string | null> = {};
    for (const [apiId, t] of teamsByApiId) {
      map[apiId] = t.badgeColor;
    }
    return map;
  }, [teamsByApiId]);

  // The team list is what decides whether this route exists at all: a deep
  // link to an unknown id used to sit on a spinner forever, because `team` is
  // derived from `teams` and stays null once the list has loaded without it.
  const teamsState = resolveFetchState({
    isLoading: teamsLoading,
    error: teamsError,
    data: teams,
  });
  const isLoading = teamsState === "loading" || matchesLoading || statsLoading;
  const teamName = team
    ? team.customName || team.nameShort || team.name
    : "";

  // Last completed match id for highlighting in "All Games"
  const lastCompletedId = lastGame?.id ?? null;

  // Stable handler: MatchCard* are memo-wrapped, and an inline arrow per call
  // site made that memo a no-op.
  const openMatch = useCallback(
    (match: MatchListItem) => {
      router.push(`/game/${String(match.id)}`);
    },
    [router],
  );

  // Memoized renderers for the "All Games" FlatList
  const renderMatchItem = useCallback<ListRenderItem<MatchListItem>>(
    ({ item: match }) => (
      <View style={{ marginBottom: spacing.sm }}>
        <MatchCardCompact
          match={match}
          highlighted={match.id === lastCompletedId}
          onPress={openMatch}
        />
      </View>
    ),
    [lastCompletedId, openMatch, spacing.sm],
  );
  const keyExtractMatch = useCallback((match: MatchListItem) => String(match.id), []);

  const { refreshing, onRefresh } = useRefresh([
    () => mutateTeams(),
    () => mutateStats(),
    () => mutateMatches(),
    () => mutateStandings(),
  ]);

  const listRefreshControl = useMemo(
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
    () => ({ paddingBottom: spacing.xl }),
    [spacing.xl],
  );

  // The standings row already carries the permanent api id the h2h route
  // takes, so no name lookup is needed to open an opponent.
  const handleOpponentPress = (teamApiId: number) => {
    router.push(`/h2h/${String(teamApiId)}`);
  };

  // --- Loading state ---

  if (isLoading) {
    return (
      <>
        {header}
        <Screen edges={UNDER_NATIVE_HEADER}>
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              paddingTop: spacing.xl,
            }}
          >
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        </Screen>
      </>
    );
  }

  // --- Error / not-found state ---
  // Reachable by deep link: the id may simply not be in the teams list.
  if (teamsState === "error" || !team) {
    return (
      <>
        {header}
        <Screen edges={UNDER_NATIVE_HEADER}>
          <ErrorState
            message={
              teamsState === "error"
                ? i18n.t("common.loadFailed")
                : i18n.t("common.notFound")
            }
            retryLabel={i18n.t("common.retry")}
            onRetry={() => {
              void mutateTeams();
            }}
          />
        </Screen>
      </>
    );
  }

  // --- Season stats values ---
  const played = teamStats?.played ?? 0;
  const wins = teamStats?.wins ?? 0;
  const losses = teamStats?.losses ?? 0;
  const diff = teamStats?.pointsDiff ?? 0;

  // Everything above "All Games" is the list header. It used to sit alongside a
  // FlatList inside the Screen's ScrollView, which nested one VirtualizedList
  // inside another: RN warns, and the inner list renders every row eagerly
  // because it never sees a viewport.
  const listHeader = (
    <>
      {/* 1. Team Header */}
        <View
          style={{
            marginBottom: spacing.lg,
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
          }}
        >
          {team ? <ClubLogo clubId={team.clubId} size={64} variant="chip" /> : null}
          <View style={{ flex: 1 }}>
            <Text
              style={[
                textStyles.screenTitle,
                { color: teamColor.name, textTransform: "none" },
              ]}
            >
              {teamName}
            </Text>
            {teamStats?.leagueName ? (
              <Text
                style={{
                  fontSize: 14,
                  fontFamily: fontFamilies.body,
                  color: colors.mutedForeground,
                  marginTop: spacing.xs,
                }}
              >
                {teamStats.leagueName}
              </Text>
            ) : null}
          </View>
        </View>

        {/* 2. Form + Position Row */}
        {teamStats ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: spacing.lg,
            }}
          >
            <FormStrip form={teamStats.form} />
            {teamStats.position !== null ? (
              <View style={{ alignItems: "center" }}>
                <Text
                  style={{
                    fontSize: 28,
                    fontFamily: fontFamilies.display,
                    color: colors.foreground,
                  }}
                >
                  #{teamStats.position}
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    fontFamily: fontFamilies.body,
                    color: colors.mutedForeground,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  {i18n.t("teamDetail.position")}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* 3. Last Game */}
        {lastGame ? (
          <View style={{ marginBottom: spacing.lg }}>
            <Text
              style={{
                fontSize: 11,
                fontFamily: fontFamilies.displayMedium,
                color: colors.mutedForeground,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: spacing.sm,
              }}
            >
              {i18n.t("teamDetail.lastGame")}
            </Text>
            <MatchCardFull match={lastGame} onPress={openMatch} />
          </View>
        ) : null}

        {/* 4. Next Game */}
        {nextGame ? (
          <View style={{ marginBottom: spacing.lg }}>
            <Text
              style={{
                fontSize: 11,
                fontFamily: fontFamilies.displayMedium,
                color: colors.mutedForeground,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: spacing.sm,
              }}
            >
              {i18n.t("teamDetail.nextGame")}
            </Text>
            <MatchCardFull match={nextGame} onPress={openMatch} />
          </View>
        ) : null}

        {/* 5. Season Stats */}
        {teamStats ? (
          <View
            style={{
              flexDirection: "row",
              backgroundColor: colors.surfaceLow,
              borderRadius: radius.md,
              padding: spacing.md,
              marginBottom: spacing.lg,
            }}
          >
            <StatCell
              label={i18n.t("teamDetail.games")}
              value={String(played)}
              color={colors.foreground}
              mutedColor={colors.mutedForeground}
            />
            <StatCell
              label={i18n.t("teamDetail.wins")}
              value={String(wins)}
              color={colors.chart1}
              mutedColor={colors.mutedForeground}
            />
            <StatCell
              label={i18n.t("teamDetail.losses")}
              value={String(losses)}
              color={colors.destructive}
              mutedColor={colors.mutedForeground}
            />
            <StatCell
              label={i18n.t("teamDetail.diff")}
              value={`${diff > 0 ? "+" : ""}${diff}`}
              color={
                diff > 0
                  ? colors.chart1
                  : diff < 0
                    ? colors.destructive
                    : colors.mutedForeground
              }
              mutedColor={colors.mutedForeground}
            />
          </View>
        ) : null}

        {/* 6. Standings */}
        {leagueStandings ? (
          <View style={{ marginBottom: spacing.lg }}>
            <Text
              style={{
                fontSize: 11,
                fontFamily: fontFamilies.displayMedium,
                color: colors.mutedForeground,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: spacing.sm,
              }}
            >
              {i18n.t("teamDetail.standings")} — {leagueStandings.leagueName}
            </Text>
            <StandingsTable
              standings={leagueStandings.standings}
              leagueName={leagueStandings.leagueName}
              seasonName={leagueStandings.seasonName}
              teamColors={teamColorMap}
              onOpponentPress={handleOpponentPress}
            />
          </View>
        ) : null}

      {/* 7. All Games — the heading only; the rows are the list itself. */}
      {allMatches.length > 0 ? (
        <Text
          style={{
            fontSize: 11,
            fontFamily: fontFamilies.displayMedium,
            color: colors.mutedForeground,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            marginBottom: spacing.sm,
          }}
        >
          {i18n.t("teamDetail.allGames")}
        </Text>
      ) : null}
    </>
  );

  return (
    <>
      {header}
      <Screen edges={UNDER_NATIVE_HEADER} scroll={false}>
        <FlatList
          data={allMatches}
          // The screen's scroll view: it takes the content inset for the
          // transparent header floating over it.
          contentInsetAdjustmentBehavior="automatic"
          renderItem={renderMatchItem}
          keyExtractor={keyExtractMatch}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <View style={{ paddingTop: spacing.xl, alignItems: "center" }}>
              <Text style={[textStyles.body, { color: colors.mutedForeground }]}>
                {i18n.t("teamDetail.noMatches")}
              </Text>
            </View>
          }
          refreshControl={listRefreshControl}
          contentContainerStyle={listContentStyle}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          windowSize={5}
          maxToRenderPerBatch={10}
        />
      </Screen>
    </>
  );
}

// --- Internal component ---

function StatCell({
  label,
  value,
  color,
  mutedColor,
}: {
  label: string;
  value: string;
  color: string;
  mutedColor: string;
}) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text
        style={{
          fontSize: 18,
          fontFamily: fontFamilies.display,
          color,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontSize: 10,
          fontFamily: fontFamilies.body,
          color: mutedColor,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginTop: 2,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
