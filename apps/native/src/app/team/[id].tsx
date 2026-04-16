import { useMemo } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import useSWR from "swr";
import type { MatchListItem } from "@dragons/shared";
import { getNativeTeamColor } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { Screen } from "@/components/Screen";
import { MatchCardFull } from "@/components/MatchCardFull";
import { MatchCardCompact } from "@/components/MatchCardCompact";
import { FormStrip } from "@/components/FormStrip";
import { StandingsTable } from "@/components/StandingsTable";
import { publicApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";
import { fontFamilies } from "@/theme/typography";

export default function TeamDetailScreen() {
  const { colors, textStyles, spacing, radius, isDark } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // --- Data fetching ---

  const { data: teams, isLoading: teamsLoading } = useSWR("teams:all", () =>
    publicApi.getTeams(),
  );

  const team = teams?.find((t) => String(t.id) === id) ?? null;

  const { data: teamStats, isLoading: statsLoading } = useSWR(
    team ? `team:${String(team.id)}:stats` : null,
    () => publicApi.getTeamStats(Number(id)),
  );

  const { data: matchesData, isLoading: matchesLoading } = useSWR(
    team ? `team:${String(team.id)}:matches` : null,
    () =>
      publicApi.getMatches({
        teamApiId: team!.apiTeamPermanentId,
        limit: 50,
        sort: "asc",
      }),
  );

  const { data: standingsData } = useSWR("standings:all", () =>
    publicApi.getStandings(),
  );

  // --- Derived data ---

  const allMatches = matchesData?.items ?? [];

  const { pastMatches, lastGame, nextGame } = useMemo(() => {
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
      pastMatches: past,
      lastGame: past.length > 0 ? past[past.length - 1]! : null,
      nextGame: future.length > 0 ? future[0]! : null,
    };
  }, [allMatches]);

  // Find league standings for this team
  const leagueStandings = useMemo(() => {
    if (!standingsData || !team) return null;
    for (const league of standingsData) {
      for (const standing of league.standings) {
        if (
          standing.teamName.includes(team.name) ||
          (team.nameShort && standing.teamName.includes(team.nameShort))
        ) {
          return league;
        }
      }
    }
    return null;
  }, [standingsData, team]);

  const teamColor = getNativeTeamColor(
    team?.badgeColor,
    team?.name ?? "",
    isDark,
  );

  const teamColorMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const t of teams ?? []) {
      map[t.name] = t.badgeColor;
      if (t.nameShort) map[t.nameShort] = t.badgeColor;
      if (t.customName) map[t.customName] = t.badgeColor;
    }
    return map;
  }, [teams]);

  const isLoading = teamsLoading || matchesLoading || statsLoading;
  const teamName = team
    ? team.customName || team.nameShort || team.name
    : "";

  // Last completed match id for highlighting in "All Games"
  const lastCompletedId = lastGame?.id ?? null;

  // Resolve opponent team API ID from standings team name
  const handleOpponentPress = (teamName: string) => {
    if (!teams) return;
    const matched = teams.find(
      (t) =>
        t.name === teamName ||
        t.nameShort === teamName ||
        t.customName === teamName,
    );
    if (matched) {
      router.push(`/h2h/${String(matched.apiTeamPermanentId)}`);
    }
  };

  // --- Loading state ---

  if (isLoading || !team) {
    return (
      <Screen headerOffset={44}>
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
    );
  }

  // --- Season stats values ---
  const played = teamStats?.played ?? 0;
  const wins = teamStats?.wins ?? 0;
  const losses = teamStats?.losses ?? 0;
  const diff = teamStats?.pointsDiff ?? 0;

  return (
    <Screen headerOffset={44}>
        {/* 1. Team Header */}
        <View style={{ marginBottom: spacing.lg }}>
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
            <MatchCardFull
              match={lastGame}
              onPress={() => router.push(`/game/${String(lastGame.id)}`)}
            />
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
            <MatchCardFull
              match={nextGame}
              onPress={() => router.push(`/game/${String(nextGame.id)}`)}
            />
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

        {/* 7. All Games */}
        {allMatches.length > 0 ? (
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
              {i18n.t("teamDetail.allGames")}
            </Text>
            {allMatches.map((match) => (
              <View key={match.id} style={{ marginBottom: spacing.sm }}>
                <MatchCardCompact
                  match={match}
                  highlighted={match.id === lastCompletedId}
                  onPress={() => router.push(`/game/${String(match.id)}`)}
                />
              </View>
            ))}
          </View>
        ) : (
          <View style={{ paddingTop: spacing.xl, alignItems: "center" }}>
            <Text
              style={[textStyles.body, { color: colors.mutedForeground }]}
            >
              {i18n.t("teamDetail.noMatches")}
            </Text>
          </View>
        )}
      </Screen>
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
