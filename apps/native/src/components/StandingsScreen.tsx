import { useMemo } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import useSWR from "swr";
import { buildTeamsByApiId } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { Screen, UNDER_NATIVE_HEADER } from "@/components/Screen";
import { StandingsTable } from "@/components/StandingsTable";
import { publicApi } from "@/lib/api";

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

  // Keyed by `teamApiId`, not by name: several squads share a display name
  // (and a short name), so a name-keyed lookup opened whichever squad happened
  // to be last in the list.
  const teamLookup = useMemo(() => buildTeamsByApiId(teams ?? []), [teams]);

  // Keyed off the same lookup, so a badge colour is always the colour of the
  // team a tap on that row would open.
  const teamColorMap = useMemo(() => {
    const map: Record<number, string | null> = {};
    for (const [apiId, team] of teamLookup) {
      map[apiId] = team.badgeColor;
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

  const handleOwnClubPress = (teamApiId: number) => {
    const team = teamLookup.get(teamApiId);
    if (team) {
      router.push(`/team/${String(team.id)}`);
    }
  };

  const handleOpponentPress = (teamApiId: number) => {
    const team = teamLookup.get(teamApiId);
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
