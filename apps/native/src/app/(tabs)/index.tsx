import { View, Text, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import useSWR from "swr";
import type { LeagueStandings } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { StatStrip } from "@/components/StatStrip";
import { publicApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";

function todayISO(): string {
  return new Date().toISOString().split("T")[0]!;
}

export default function HomeScreen() {
  const { colors, textStyles, spacing } = useTheme();
  const router = useRouter();

  const { data: nextGameData, isLoading: nextLoading } = useSWR(
    "home:nextGame",
    () =>
      publicApi.getMatches({
        limit: 1,
        dateFrom: todayISO(),
        hasScore: false,
        sort: "asc",
      }),
  );

  const { data: lastResultData, isLoading: lastLoading } = useSWR(
    "home:lastResult",
    () =>
      publicApi.getMatches({
        limit: 1,
        dateTo: todayISO(),
        hasScore: true,
        sort: "desc",
      }),
  );

  const { data: standingsData, isLoading: standingsLoading } = useSWR(
    "home:standings",
    () => publicApi.getStandings(),
  );

  const isLoading = nextLoading || lastLoading || standingsLoading;
  const nextGame = nextGameData?.items[0] ?? null;
  const lastResult = lastResultData?.items[0] ?? null;

  // Find best own-club standing across all leagues
  const ownStanding = findOwnClubStanding(standingsData);

  if (isLoading) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingTop: spacing.xl }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      {/* Next Game Card */}
      {nextGame ? (
        <Card
          onPress={() => router.push(`/game/${String(nextGame.id)}`)}
          style={{ marginTop: spacing.lg }}
        >
          <Badge label={i18n.t("home.nextGame").toUpperCase()} variant="heat" />
          <View style={{ alignItems: "center", marginTop: spacing.md }}>
            <Text style={[textStyles.cardTitle, { color: colors.foreground, textAlign: "center" }]}>
              {nextGame.homeTeamName}
            </Text>
            <Text
              style={[
                textStyles.caption,
                { color: colors.mutedForeground, marginVertical: spacing.xs },
              ]}
            >
              {i18n.t("home.vs")}
            </Text>
            <Text style={[textStyles.cardTitle, { color: colors.foreground, textAlign: "center" }]}>
              {nextGame.guestTeamName}
            </Text>
          </View>
          <View style={{ alignItems: "center", marginTop: spacing.md }}>
            <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
              {nextGame.kickoffDate} · {nextGame.kickoffTime}
            </Text>
            {nextGame.venueName ? (
              <Text
                style={[
                  textStyles.caption,
                  { color: colors.mutedForeground, marginTop: spacing.xs },
                ]}
              >
                {nextGame.venueName}
              </Text>
            ) : null}
          </View>
        </Card>
      ) : (
        <Card style={{ marginTop: spacing.lg }}>
          <Badge label={i18n.t("home.nextGame").toUpperCase()} variant="heat" />
          <Text
            style={[
              textStyles.body,
              { color: colors.mutedForeground, marginTop: spacing.md },
            ]}
          >
            {i18n.t("home.noUpcoming")}
          </Text>
        </Card>
      )}

      {/* Last Result Card */}
      {lastResult ? (
        <Card
          onPress={() => router.push(`/game/${String(lastResult.id)}`)}
          style={{ marginTop: spacing.md }}
        >
          <Badge label={i18n.t("home.lastResult").toUpperCase()} />
          <View style={{ alignItems: "center", marginTop: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text
                  style={[textStyles.caption, { color: colors.mutedForeground, marginBottom: spacing.xs }]}
                  numberOfLines={2}
                >
                  {lastResult.homeTeamName}
                </Text>
                <Text style={[textStyles.score, { color: colors.foreground }]}>
                  {lastResult.homeScore ?? "-"}
                </Text>
              </View>
              <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>:</Text>
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text
                  style={[textStyles.caption, { color: colors.mutedForeground, marginBottom: spacing.xs }]}
                  numberOfLines={2}
                >
                  {lastResult.guestTeamName}
                </Text>
                <Text style={[textStyles.score, { color: colors.foreground }]}>
                  {lastResult.guestScore ?? "-"}
                </Text>
              </View>
            </View>
          </View>
        </Card>
      ) : null}

      {/* Navigation Cards Row */}
      <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
        <Card
          onPress={() => router.push("/schedule")}
          style={{ flex: 1 }}
        >
          <Text style={[textStyles.sectionTitle, { color: colors.foreground }]}>
            {i18n.t("tabs.schedule")}
          </Text>
        </Card>
        <Card
          onPress={() => router.push("/standings")}
          style={{ flex: 1 }}
        >
          <Text style={[textStyles.sectionTitle, { color: colors.foreground }]}>
            {i18n.t("tabs.standings")}
          </Text>
        </Card>
      </View>

      {/* Stat Strip */}
      {ownStanding ? (
        <View style={{ marginTop: spacing.md }}>
          <StatStrip
            items={[
              { label: i18n.t("standings.pos"), value: String(ownStanding.position) },
              { label: i18n.t("standings.won"), value: String(ownStanding.won) },
              { label: i18n.t("standings.points"), value: String(ownStanding.leaguePoints) },
            ]}
          />
        </View>
      ) : null}
    </Screen>
  );
}

function findOwnClubStanding(data: LeagueStandings[] | undefined) {
  if (!data) return null;

  let best: { position: number; won: number; leaguePoints: number } | null = null;

  for (const league of data) {
    for (const team of league.standings) {
      if (team.isOwnClub) {
        if (!best || team.position < best.position) {
          best = {
            position: team.position,
            won: team.won,
            leaguePoints: team.leaguePoints,
          };
        }
      }
    }
  }

  return best;
}
