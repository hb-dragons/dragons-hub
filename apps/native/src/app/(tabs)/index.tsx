import { View, Text, ActivityIndicator, Pressable } from "react-native";
import { useRouter } from "expo-router";
import useSWR from "swr";
import { useTheme } from "@/hooks/useTheme";
import { Screen } from "@/components/Screen";
import { StatStrip } from "@/components/StatStrip";
import { MatchCardFull } from "@/components/MatchCardFull";
import { MatchCardCompact } from "@/components/MatchCardCompact";
import { ResultChip } from "@/components/ResultChip";
import { authClient } from "@/lib/auth-client";
import { publicApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";
import { fontFamilies } from "@/theme/typography";
import { Wordmark } from "@/components/brand/Wordmark";

function getCountdown(kickoffDate: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const game = new Date(kickoffDate + "T00:00:00");
  game.setHours(0, 0, 0, 0);
  const days = Math.round((game.getTime() - today.getTime()) / 86400000);
  if (days === 0) return i18n.t("home.countdown.today");
  if (days === 1) return i18n.t("home.countdown.tomorrow");
  return i18n.t("home.countdown.inDays", { count: days });
}

export default function HomeScreen() {
  const { colors, textStyles, spacing, radius } = useTheme();
  const router = useRouter();
  const { data: session } = authClient.useSession();

  const initial = session?.user?.name?.trim().charAt(0).toUpperCase() ?? "";
  const isSignedIn = Boolean(session);

  const { data: dashboard, isLoading, mutate } = useSWR("home:dashboard", () =>
    publicApi.getHomeDashboard(),
  );

  if (isLoading || !dashboard) {
    return (
      <Screen>
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

  const { nextGame, recentResults, upcomingGames, clubStats } = dashboard;

  return (
    <Screen onRefresh={() => mutate()}>
      {/* Header: Wordmark + Profile / Sign-In affordance */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: spacing.sm,
        }}
      >
        <Wordmark width={120} />
        <Pressable
          onPress={() => router.push("/profile")}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={
            isSignedIn ? i18n.t("profile.title") : i18n.t("auth.signIn")
          }
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: isSignedIn ? colors.primary : colors.surfaceHigh,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: isSignedIn ? colors.primaryForeground : colors.mutedForeground,
              fontSize: 16,
              fontFamily: fontFamilies.bodySemiBold,
            }}
          >
            {isSignedIn ? initial : "?"}
          </Text>
        </Pressable>
      </View>

      {/* Section: Next Game */}
      <View style={{ marginTop: spacing.lg }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: spacing.sm,
          }}
        >
          <Text
            style={[
              textStyles.sectionTitle,
              { color: colors.mutedForeground },
            ]}
          >
            {i18n.t("home.nextGame").toUpperCase()}
          </Text>

          {nextGame ? (
            <View
              style={{
                backgroundColor: colors.primary + "1A",
                borderRadius: radius.md,
                paddingHorizontal: spacing.sm,
                paddingVertical: 2,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontFamily: fontFamilies.bodySemiBold,
                  color: colors.primary,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                {getCountdown(nextGame.kickoffDate)}
              </Text>
            </View>
          ) : null}
        </View>

        {nextGame ? (
          <MatchCardFull
            match={nextGame}
            onPress={() => router.push(`/game/${String(nextGame.id)}`)}
          />
        ) : (
          <View
            style={{
              backgroundColor: colors.surfaceLowest,
              borderRadius: radius.md,
              padding: spacing.lg,
            }}
          >
            <Text style={[textStyles.body, { color: colors.mutedForeground }]}>
              {i18n.t("home.noUpcoming")}
            </Text>
          </View>
        )}
      </View>

      {/* Section: Recent Results */}
      {recentResults.length > 0 ? (
        <View style={{ marginTop: spacing.lg }}>
          <Text
            style={[
              textStyles.sectionTitle,
              { color: colors.mutedForeground, marginBottom: spacing.sm },
            ]}
          >
            {i18n.t("home.recentResults").toUpperCase()}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {recentResults.slice(0, 5).map((match) => (
              <View key={match.id} style={{ flex: 1 }}>
                <ResultChip
                  match={match}
                  onPress={() => router.push(`/game/${String(match.id)}`)}
                />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Section: Quick Stats */}
      <View style={{ marginTop: spacing.lg }}>
        <StatStrip
          items={[
            {
              label: i18n.t("home.stats.teams"),
              value: String(clubStats.teamCount),
            },
            {
              label: i18n.t("home.stats.wins"),
              value: String(clubStats.totalWins),
              valueColor: colors.chart1,
            },
            {
              label: i18n.t("home.stats.losses"),
              value: String(clubStats.totalLosses),
              valueColor: colors.destructive,
            },
            {
              label: i18n.t("home.stats.winRate"),
              value: `${Math.round(clubStats.winPercentage)}%`,
            },
          ]}
        />
      </View>

      {/* Section: Upcoming Games */}
      {upcomingGames.length > 0 ? (
        <View style={{ marginTop: spacing.lg }}>
          <Text
            style={[
              textStyles.sectionTitle,
              { color: colors.mutedForeground, marginBottom: spacing.sm },
            ]}
          >
            {i18n.t("home.upcomingGames").toUpperCase()}
          </Text>
          <View style={{ gap: spacing.sm }}>
            {upcomingGames.slice(0, 3).map((match) => (
              <MatchCardCompact
                key={match.id}
                match={match}
                onPress={() => router.push(`/game/${String(match.id)}`)}
              />
            ))}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}
