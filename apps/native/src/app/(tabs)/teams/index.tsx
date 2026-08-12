import { useCallback } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import useSWR from "swr";
import type { PublicTeam } from "@dragons/api-client";
import { useTheme } from "@/hooks/useTheme";
import { Screen, UNDER_NATIVE_HEADER } from "@/components/Screen";
import { TeamCard } from "@/components/TeamCard";
import { publicApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";

const YOUTH_PATTERN = /u\d{2}|jugend|mini|bambini/i;

function isYouthTeam(team: PublicTeam): boolean {
  return YOUTH_PATTERN.test(team.name) || (team.customName !== null && YOUTH_PATTERN.test(team.customName));
}

export default function TeamsScreen() {
  const { colors, textStyles, spacing } = useTheme();
  const router = useRouter();

  const { data, isLoading, mutate } = useSWR("teams:all", () => publicApi.getTeams());

  // Stable: TeamCard is memo-wrapped, so an inline arrow here would make the
  // memo a no-op.
  const navigateToTeam = useCallback(
    (team: PublicTeam) => {
      router.push(`/team/${String(team.id)}`);
    },
    [router],
  );


  if (isLoading) {
    return (
      <Screen edges={UNDER_NATIVE_HEADER}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingTop: spacing.xl }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  const allTeams = (data ?? []).filter((t) => t.isOwnClub === true);
  const seniorTeams = allTeams.filter((t) => !isYouthTeam(t));
  const youthTeams = allTeams.filter((t) => isYouthTeam(t));

  return (
    <Screen edges={UNDER_NATIVE_HEADER} onRefresh={() => mutate()}>
      {/* The screen title is the stack's large title; only the subline is ours. */}
      <Text
        style={[
          textStyles.caption,
          { color: colors.mutedForeground, marginBottom: spacing.md },
        ]}
      >
        {i18n.t("teams.subtitle")}
      </Text>

      {/* Senior section */}
      {seniorTeams.length > 0 ? (
        <View style={{ marginBottom: spacing.lg }}>
          <Text
            style={[
              textStyles.sectionTitle,
              { color: colors.foreground, marginBottom: spacing.md },
            ]}
          >
            {i18n.t("teams.senior")}
          </Text>

          {/* Featured team (first) */}
          <View style={{ marginBottom: spacing.md }}>
            <TeamCard
              team={seniorTeams[0]!}
              featured
              onPress={navigateToTeam}
            />
          </View>

          {/* Remaining in 2-column grid */}
          {seniorTeams.length > 1 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
              {seniorTeams.slice(1).map((team) => (
                <View key={team.id} style={{ width: "48%" }}>
                  <TeamCard
                    team={team}
                    onPress={navigateToTeam}
                  />
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Youth section */}
      {youthTeams.length > 0 ? (
        <View>
          <Text
            style={[
              textStyles.sectionTitle,
              { color: colors.foreground, marginBottom: spacing.md },
            ]}
          >
            {i18n.t("teams.youth")}
          </Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
            {youthTeams.map((team) => (
              <View key={team.id} style={{ width: "48%" }}>
                <TeamCard
                  team={team}
                  onPress={navigateToTeam}
                />
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}
