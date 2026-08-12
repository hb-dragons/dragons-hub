import { useMemo } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import useSWR from "swr";
import type { PublicTeam } from "@dragons/api-client";
import { useTheme } from "@/hooks/useTheme";
import { Screen, UNDER_NATIVE_HEADER } from "@/components/Screen";
import { StandingsTable } from "@/components/StandingsTable";
import { publicApi } from "@/lib/api";

/** Build a lookup map from every name a standings row may use → team record */
function buildTeamLookup(teams: PublicTeam[]): Map<string, PublicTeam> {
  const map = new Map<string, PublicTeam>();
  for (const team of teams) {
    map.set(team.name, team);
    if (team.nameShort) map.set(team.nameShort, team);
    if (team.customName) map.set(team.customName, team);
  }
  return map;
}

/**
 * The league tables. Rendered by two routes: the Standings tab that Fans get,
 * and `/league-tables`, the pushed screen Staff reach from Home when the
 * Officiating tab has taken the Standings slot.
 *
 * Both sit under a native large-title header carrying the screen title, so
 * this renders content only and takes no props: the two routes differ in how
 * they are reached, not in what they show.
 */
export function StandingsScreen() {
  const { colors, spacing } = useTheme();
  const router = useRouter();

  const {
    data: standings,
    isLoading: standingsLoading,
    mutate: mutateStandings,
  } = useSWR("standings:all", () => publicApi.getStandings());

  const {
    data: teams,
    isLoading: teamsLoading,
    mutate: mutateTeams,
  } = useSWR("teams:all", () => publicApi.getTeams());

  const isLoading = standingsLoading || teamsLoading;

  const teamLookup = useMemo(() => buildTeamLookup(teams ?? []), [teams]);

  // Keyed off the same lookup, so a badge colour is always the colour of the
  // team a tap on that row would open.
  const teamColorMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const [name, team] of teamLookup) {
      map[name] = team.badgeColor;
    }
    return map;
  }, [teamLookup]);

  if (isLoading) {
    return (
      <Screen edges={UNDER_NATIVE_HEADER}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingTop: spacing.xl }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  const leagues = standings ?? [];

  const handleOwnClubPress = (teamName: string) => {
    const team = teamLookup.get(teamName);
    if (team) {
      router.push(`/team/${String(team.id)}`);
    }
  };

  const handleOpponentPress = (teamName: string) => {
    const team = teamLookup.get(teamName);
    if (team) {
      router.push(`/h2h/${String(team.apiTeamPermanentId)}`);
    }
  };

  return (
    <Screen
      edges={UNDER_NATIVE_HEADER}
      onRefresh={[() => mutateStandings(), () => mutateTeams()]}
    >
      {leagues.map((league) => (
        <View key={league.leagueId} style={{ marginBottom: spacing.lg }}>
          <StandingsTable
            standings={league.standings}
            leagueName={league.leagueName}
            seasonName={league.seasonName}
            teamColors={teamColorMap}
            onOwnClubPress={handleOwnClubPress}
            onOpponentPress={handleOpponentPress}
          />
        </View>
      ))}
    </Screen>
  );
}
