import { useMemo } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import useSWR from "swr";
import type { MatchListItem } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { MatchCard } from "@/components/MatchCard";
import { publicApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";

function todayISO(): string {
  return new Date().toISOString().split("T")[0]!;
}

export default function TeamDetailScreen() {
  const { colors, textStyles, spacing } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: teams, isLoading: teamsLoading } = useSWR("teams:all", () =>
    publicApi.getTeams(),
  );

  const team = teams?.find((t) => String(t.id) === id) ?? null;

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

  const matches = matchesData?.items ?? [];
  const today = todayISO();

  const { lastGame, nextGame, upcoming } = useMemo(() => {
    const past: MatchListItem[] = [];
    const future: MatchListItem[] = [];

    for (const m of matches) {
      if (m.homeScore !== null && m.guestScore !== null) {
        past.push(m);
      } else {
        future.push(m);
      }
    }

    return {
      lastGame: past.length > 0 ? past[past.length - 1]! : null,
      nextGame: future.length > 0 ? future[0]! : null,
      upcoming: future.slice(1),
    };
  }, [matches]);

  // Find league position for this team
  const leagueInfo = useMemo(() => {
    if (!standingsData || !team) return null;
    for (const league of standingsData) {
      for (const standing of league.standings) {
        if (
          standing.teamName.includes(team.name) ||
          (team.nameShort && standing.teamName.includes(team.nameShort))
        ) {
          return { leagueName: league.leagueName, position: standing.position };
        }
      }
    }
    return null;
  }, [standingsData, team]);

  const isLoading = teamsLoading || matchesLoading;
  const teamName = team
    ? team.customName || team.nameShort || team.name
    : "";

  if (isLoading || !team) {
    return (
      <>
        <Stack.Screen options={{ title: teamName || "..." }} />
        <Screen>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingTop: spacing.xl }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: teamName }} />
      <Screen>
        {/* Hero */}
        <View style={{ marginBottom: spacing.lg }}>
          <Text style={[textStyles.screenTitle, { color: colors.foreground }]}>
            {teamName}
          </Text>
          {leagueInfo ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm }}>
              <Badge label={leagueInfo.leagueName} />
              <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
                {i18n.t("teamDetail.position")}: #{String(leagueInfo.position)}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Last Game */}
        {lastGame ? (
          <View style={{ marginBottom: spacing.md }}>
            <Text
              style={[
                textStyles.label,
                { color: colors.mutedForeground, marginBottom: spacing.sm },
              ]}
            >
              {i18n.t("teamDetail.lastGame")}
            </Text>
            <Card onPress={() => router.push(`/game/${String(lastGame.id)}`)}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Text style={[textStyles.body, { color: colors.foreground }]}>
                    {lastGame.homeTeamCustomName || lastGame.homeTeamNameShort || lastGame.homeTeamName}
                  </Text>
                  <Text style={[textStyles.body, { color: colors.foreground, marginTop: spacing.xs }]}>
                    {lastGame.guestTeamCustomName || lastGame.guestTeamNameShort || lastGame.guestTeamName}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[textStyles.score, { color: colors.foreground }]}>
                    {lastGame.homeScore} : {lastGame.guestScore}
                  </Text>
                </View>
              </View>
            </Card>
          </View>
        ) : null}

        {/* Next Game */}
        {nextGame ? (
          <View style={{ marginBottom: spacing.md }}>
            <Text
              style={[
                textStyles.label,
                { color: colors.mutedForeground, marginBottom: spacing.sm },
              ]}
            >
              {i18n.t("teamDetail.nextGame")}
            </Text>
            <Card onPress={() => router.push(`/game/${String(nextGame.id)}`)}>
              <Badge label={nextGame.homeIsOwnClub ? "HOME" : "AWAY"} variant="heat" />
              <View style={{ alignItems: "center", marginTop: spacing.md }}>
                <Text style={[textStyles.cardTitle, { color: colors.foreground, textAlign: "center" }]}>
                  {nextGame.homeTeamCustomName || nextGame.homeTeamNameShort || nextGame.homeTeamName}
                </Text>
                <Text style={[textStyles.caption, { color: colors.mutedForeground, marginVertical: spacing.xs }]}>
                  vs
                </Text>
                <Text style={[textStyles.cardTitle, { color: colors.foreground, textAlign: "center" }]}>
                  {nextGame.guestTeamCustomName || nextGame.guestTeamNameShort || nextGame.guestTeamName}
                </Text>
              </View>
              <View style={{ alignItems: "center", marginTop: spacing.md }}>
                <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
                  {nextGame.kickoffDate} · {nextGame.kickoffTime.slice(0, 5)}
                </Text>
              </View>
            </Card>
          </View>
        ) : null}

        {/* Upcoming matches */}
        {upcoming.length > 0 ? (
          <View>
            <Text
              style={[
                textStyles.label,
                { color: colors.mutedForeground, marginBottom: spacing.sm },
              ]}
            >
              {i18n.t("teamDetail.upcoming")}
            </Text>
            {upcoming.map((match) => (
              <View key={match.id} style={{ marginBottom: spacing.sm }}>
                <MatchCard
                  match={match}
                  onPress={() => router.push(`/game/${String(match.id)}`)}
                />
              </View>
            ))}
          </View>
        ) : null}

        {matches.length === 0 ? (
          <View style={{ paddingTop: spacing.xl, alignItems: "center" }}>
            <Text style={[textStyles.body, { color: colors.mutedForeground }]}>
              {i18n.t("teamDetail.noMatches")}
            </Text>
          </View>
        ) : null}
      </Screen>
    </>
  );
}
