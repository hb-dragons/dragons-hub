import { View, Text, ActivityIndicator } from "react-native";
import useSWR from "swr";
import { useTheme } from "@/hooks/useTheme";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { StandingsRow } from "@/components/StandingsRow";
import { publicApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";

export default function StandingsScreen() {
  const { colors, textStyles, spacing, radius } = useTheme();

  const { data, isLoading } = useSWR("standings:all", () =>
    publicApi.getStandings(),
  );

  if (isLoading) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingTop: spacing.xl }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  const leagues = data ?? [];

  return (
    <Screen>
      <SectionHeader title={i18n.t("standings.title")} />

      {leagues.map((league) => (
        <View
          key={league.leagueId}
          style={{
            backgroundColor: colors.surfaceLowest,
            borderRadius: radius.md,
            marginBottom: spacing.md,
            overflow: "hidden",
          }}
        >
          {/* League name */}
          <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
            <Text style={[textStyles.cardTitle, { color: colors.foreground }]}>
              {league.leagueName}
            </Text>
          </View>

          {/* Table header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.md,
              backgroundColor: colors.surfaceLow,
            }}
          >
            <Text
              style={[
                textStyles.tableHeader,
                { color: colors.mutedForeground, width: 32, textAlign: "center" },
              ]}
            >
              {i18n.t("standings.pos")}
            </Text>
            <Text
              style={[
                textStyles.tableHeader,
                { color: colors.mutedForeground, flex: 1, marginLeft: spacing.sm },
              ]}
            >
              {i18n.t("standings.team")}
            </Text>
            <Text
              style={[
                textStyles.tableHeader,
                { color: colors.mutedForeground, width: 32, textAlign: "center" },
              ]}
            >
              {i18n.t("standings.won")}
            </Text>
            <Text
              style={[
                textStyles.tableHeader,
                { color: colors.mutedForeground, width: 32, textAlign: "center" },
              ]}
            >
              {i18n.t("standings.lost")}
            </Text>
            <Text
              style={[
                textStyles.tableHeader,
                { color: colors.mutedForeground, width: 40, textAlign: "center" },
              ]}
            >
              {i18n.t("standings.points")}
            </Text>
          </View>

          {/* Rows */}
          {league.standings.map((item) => (
            <StandingsRow
              key={`${String(league.leagueId)}-${String(item.position)}`}
              item={item}
              isOwnClub={item.isOwnClub}
            />
          ))}
        </View>
      ))}
    </Screen>
  );
}
