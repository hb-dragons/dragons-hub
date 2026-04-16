import { View, Text, ActivityIndicator } from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import useSWR from "swr";
import { useTheme } from "@/hooks/useTheme";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { publicApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";

export default function GameDetailScreen() {
  const { colors, textStyles, spacing, radius } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  // TODO: Add a /public/matches/:id endpoint to avoid fetching a list.
  // For now, use the same SWR key as the schedule screen so cached data is reused.
  // Falls back to a limited fetch when no cache is available.
  const { data, isLoading } = useSWR("matches:schedule", () =>
    publicApi.getMatches({ limit: 100 }),
  );

  const match = data?.items.find((m) => String(m.id) === id) ?? null;

  const hasScore =
    match !== null && match.homeScore !== null && match.guestScore !== null;

  const homeName = match
    ? match.homeTeamCustomName || match.homeTeamNameShort || match.homeTeamName
    : "";
  const guestName = match
    ? match.guestTeamCustomName ||
      match.guestTeamNameShort ||
      match.guestTeamName
    : "";

  const headerTitle = match
    ? `${homeName} vs ${guestName}`
    : "...";

  if (isLoading || !match) {
    return (
      <>
        <Stack.Screen options={{ title: headerTitle }} />
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
      </>
    );
  }

  const venueName = match.venueNameOverride || match.venueName;

  return (
    <>
      <Stack.Screen options={{ title: headerTitle }} />
      <Screen>
        {/* League badge */}
        {match.leagueName ? (
          <View style={{ marginBottom: spacing.md }}>
            <Badge label={match.leagueName} />
          </View>
        ) : null}

        {/* Score / VS card */}
        <Card style={{ marginBottom: spacing.md }}>
          <View style={{ alignItems: "center" }}>
            {/* Teams and score */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                width: "100%",
              }}
            >
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text
                  style={[
                    textStyles.cardTitle,
                    {
                      color: match.homeIsOwnClub
                        ? colors.primary
                        : colors.foreground,
                      textAlign: "center",
                    },
                  ]}
                  numberOfLines={2}
                >
                  {homeName}
                </Text>
                {match.homeIsOwnClub ? (
                  <Badge label="HOME" variant="secondary" />
                ) : null}
              </View>

              <View style={{ alignItems: "center", paddingHorizontal: spacing.md }}>
                {hasScore ? (
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={[textStyles.score, { color: colors.foreground }]}>
                      {match.homeScore}
                    </Text>
                    <Text
                      style={[
                        textStyles.cardTitle,
                        {
                          color: colors.mutedForeground,
                          marginHorizontal: spacing.sm,
                        },
                      ]}
                    >
                      :
                    </Text>
                    <Text style={[textStyles.score, { color: colors.foreground }]}>
                      {match.guestScore}
                    </Text>
                  </View>
                ) : (
                  <Text
                    style={[
                      textStyles.sectionTitle,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    VS
                  </Text>
                )}
              </View>

              <View style={{ flex: 1, alignItems: "center" }}>
                <Text
                  style={[
                    textStyles.cardTitle,
                    {
                      color: match.guestIsOwnClub
                        ? colors.primary
                        : colors.foreground,
                      textAlign: "center",
                    },
                  ]}
                  numberOfLines={2}
                >
                  {guestName}
                </Text>
                {match.guestIsOwnClub ? (
                  <Badge label="AWAY" variant="secondary" />
                ) : null}
              </View>
            </View>
          </View>
        </Card>

        {/* Date, time, venue info */}
        <Card style={{ marginBottom: spacing.md }}>
          <View style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
                {i18n.t("gameDetail.date")}
              </Text>
              <Text style={[textStyles.body, { color: colors.foreground }]}>
                {match.kickoffDate}
              </Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
                {i18n.t("gameDetail.time")}
              </Text>
              <Text style={[textStyles.body, { color: colors.foreground }]}>
                {match.kickoffTime.slice(0, 5)}
              </Text>
            </View>
            {venueName ? (
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
                  {i18n.t("gameDetail.venue")}
                </Text>
                <Text
                  style={[textStyles.body, { color: colors.foreground, flex: 1, textAlign: "right", marginLeft: spacing.md }]}
                  numberOfLines={2}
                >
                  {venueName}
                </Text>
              </View>
            ) : null}
          </View>
        </Card>

        {/* Status badges */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {match.isConfirmed === true ? (
            <Badge label={i18n.t("gameDetail.confirmed")} variant="default" />
          ) : null}
          {match.isCancelled === true ? (
            <Badge label={i18n.t("gameDetail.cancelled")} variant="destructive" />
          ) : null}
          {match.isForfeited === true ? (
            <Badge label={i18n.t("gameDetail.forfeited")} variant="heat" />
          ) : null}
        </View>
      </Screen>
    </>
  );
}
