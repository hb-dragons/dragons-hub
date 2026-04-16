import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import useSWR from "swr";
import type { PublicTeam } from "@dragons/api-client";
import { useTheme } from "@/hooks/useTheme";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { StandingsTable } from "@/components/StandingsTable";
import { publicApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";

/** Build a lookup map from team name / nameShort → team record */
function buildTeamLookup(teams: PublicTeam[]): Map<string, PublicTeam> {
  const map = new Map<string, PublicTeam>();
  for (const team of teams) {
    map.set(team.name, team);
    if (team.nameShort) map.set(team.nameShort, team);
    if (team.customName) map.set(team.customName, team);
  }
  return map;
}

export default function StandingsScreen() {
  const { colors, spacing } = useTheme();
  const router = useRouter();

  const { data: standings, isLoading: standingsLoading } = useSWR(
    "standings:all",
    () => publicApi.getStandings(),
  );

  const { data: teams, isLoading: teamsLoading } = useSWR(
    "teams:all",
    () => publicApi.getTeams(),
  );

  const isLoading = standingsLoading || teamsLoading;

  if (isLoading) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingTop: spacing.xl }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  const leagues = standings ?? [];
  const teamLookup = buildTeamLookup(teams ?? []);

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
    <Screen>
      <SectionHeader title={i18n.t("standings.title")} />

      {leagues.map((league) => (
        <View key={league.leagueId} style={{ marginBottom: spacing.lg }}>
          <StandingsTable
            standings={league.standings}
            leagueName={league.leagueName}
            seasonName={league.seasonName}
            onOwnClubPress={handleOwnClubPress}
            onOpponentPress={handleOpponentPress}
          />
        </View>
      ))}
    </Screen>
  );
}
