import { View, Text, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import useSWR from "swr";
import { getNativeTeamColor } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { QuarterTable } from "@/components/QuarterTable";
import { HeadToHead } from "@/components/HeadToHead";
import { FormStrip } from "@/components/FormStrip";
import { publicApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";
import { fontFamilies } from "@/theme/typography";

export default function GameDetailScreen() {
  const { colors, textStyles, spacing, radius, isDark } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: match, isLoading: matchLoading } = useSWR(
    `match:${id}`,
    () => publicApi.getMatch(Number(id)),
  );
  const { data: context } = useSWR(
    `match:${id}:context`,
    () => publicApi.getMatchContext(Number(id)),
  );

  const homeName = match
    ? (match.homeTeamCustomName ?? match.homeTeamNameShort ?? match.homeTeamName)
    : "";
  const guestName = match
    ? (match.guestTeamCustomName ?? match.guestTeamNameShort ?? match.guestTeamName)
    : "";

  if (matchLoading || !match) {
    return (
      <Screen edges={[]}>
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

  const hasScore = match.homeScore !== null && match.guestScore !== null;

  // Full names for the score card (own-club uses display name, opponent uses full federation name)
  const homeScoreName = match.homeIsOwnClub ? homeName : match.homeTeamName;
  const guestScoreName = match.guestIsOwnClub ? guestName : match.guestTeamName;

  const homeLabel = homeName;
  const guestLabel = guestName;

  const homeColor = match.homeIsOwnClub
    ? getNativeTeamColor(match.homeBadgeColor, match.homeTeamName, isDark).name
    : colors.mutedForeground;
  const guestColor = match.guestIsOwnClub
    ? getNativeTeamColor(match.guestBadgeColor, match.guestTeamName, isDark).name
    : colors.mutedForeground;

  const homeWon = hasScore && match.homeScore! > match.guestScore!;
  const guestWon = hasScore && match.guestScore! > match.homeScore!;

  const venueName = match.venueNameOverride || match.venueName;

  // Build address string from parts
  const addressParts = [
    match.venueStreet,
    [match.venuePostalCode, match.venueCity].filter(Boolean).join(" "),
  ].filter(Boolean);
  const address = addressParts.length > 0 ? addressParts.join(", ") : null;

  // Opponent name for H2H section label
  const opponentName = match.homeIsOwnClub ? guestName : homeName;
  const ownLabel = match.homeIsOwnClub ? homeLabel : guestLabel;
  const ownColor = match.homeIsOwnClub ? homeColor : guestColor;

  const sectionLabelStyle = {
    fontSize: 11,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    color: colors.mutedForeground,
    fontFamily: fontFamilies.displayMedium,
  };

  const detailRowStyle = {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "flex-start" as const,
  };

  return (
    <Screen edges={[]}>
      {/* ── 1. Score Header ── */}
        <Card
          style={{
            marginBottom: spacing.md,
            backgroundColor: match.homeIsOwnClub
              ? isDark ? "rgba(0,75,35,0.12)" : "rgba(0,75,35,0.06)"
              : undefined,
          }}
        >
          <View style={{ alignItems: "center" }}>
            {/* Date / time / venue meta */}
            <Text
              style={[
                textStyles.caption,
                { color: colors.mutedForeground, textAlign: "center", marginBottom: spacing.sm },
              ]}
            >
              {match.kickoffDate} · {match.kickoffTime.slice(0, 5)}
              {venueName ? ` · ${venueName}` : ""}
            </Text>

            {/* Teams and score */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                width: "100%",
              }}
            >
              {/* Home team */}
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text
                  style={[
                    textStyles.cardTitle,
                    {
                      color: match.homeIsOwnClub ? homeColor : colors.mutedForeground,
                      fontFamily: match.homeIsOwnClub
                        ? fontFamilies.bodySemiBold
                        : fontFamilies.body,
                      textAlign: "center",
                    },
                  ]}
                  numberOfLines={2}
                >
                  {homeScoreName}
                </Text>
              </View>

              {/* Score or VS */}
              <View style={{ alignItems: "center", paddingHorizontal: spacing.md }}>
                {hasScore ? (
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text
                      style={[
                        textStyles.score,
                        {
                          color: homeWon ? colors.foreground : colors.mutedForeground,
                          fontWeight: homeWon ? "700" : "400",
                        },
                      ]}
                    >
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
                    <Text
                      style={[
                        textStyles.score,
                        {
                          color: guestWon ? colors.foreground : colors.mutedForeground,
                          fontWeight: guestWon ? "700" : "400",
                        },
                      ]}
                    >
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

              {/* Guest team */}
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text
                  style={[
                    textStyles.cardTitle,
                    {
                      color: match.guestIsOwnClub ? guestColor : colors.mutedForeground,
                      fontFamily: match.guestIsOwnClub
                        ? fontFamilies.bodySemiBold
                        : fontFamilies.body,
                      textAlign: "center",
                    },
                  ]}
                  numberOfLines={2}
                >
                  {guestScoreName}
                </Text>
              </View>
            </View>

            {/* Final label */}
            {hasScore ? (
              <Text
                style={[
                  sectionLabelStyle,
                  { color: colors.primary, marginTop: spacing.sm },
                ]}
              >
                {i18n.t("gameDetail.final")}
              </Text>
            ) : null}
          </View>
        </Card>

        {/* ── 2. Quarter Breakdown ── */}
        <View style={{ marginBottom: spacing.md }}>
          <QuarterTable
            match={match}
            homeLabel={homeLabel}
            guestLabel={guestLabel}
            homeColor={homeColor}
          />
        </View>

        {/* ── 3. Head-to-Head ── */}
        {context ? (
          <View style={{ marginBottom: spacing.md }}>
            <HeadToHead
              data={context.headToHead}
              opponentName={opponentName}
              ownLabel={ownLabel}
              ownColor={ownColor}
              onMatchPress={(matchId) => router.push(`/game/${matchId}`)}
            />
          </View>
        ) : null}

        {/* ── 4. Form (Last 5) ── */}
        {context && (context.homeForm.length > 0 || context.guestForm.length > 0) ? (
          <View style={{ marginBottom: spacing.md }}>
            <Text style={[sectionLabelStyle, { marginBottom: spacing.sm }]}>
              {i18n.t("gameDetail.form")}
            </Text>
            <View
              style={{
                backgroundColor: colors.surfaceLowest,
                borderRadius: radius.md,
                padding: spacing.lg,
                gap: spacing.sm,
              }}
            >
              {/* Own-club team form */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Text
                  style={{
                    width: 72,
                    fontSize: 13,
                    fontFamily: fontFamilies.bodySemiBold,
                    color: match.homeIsOwnClub ? homeColor : guestColor,
                  }}
                  numberOfLines={1}
                >
                  {match.homeIsOwnClub ? homeLabel : guestLabel}
                </Text>
                <FormStrip
                  form={match.homeIsOwnClub ? context.homeForm : context.guestForm}
                />
              </View>
              {/* Opponent form */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Text
                  style={{
                    width: 72,
                    fontSize: 13,
                    fontFamily: fontFamilies.body,
                    color: colors.mutedForeground,
                  }}
                  numberOfLines={1}
                >
                  {match.homeIsOwnClub ? guestLabel : homeLabel}
                </Text>
                <FormStrip
                  form={match.homeIsOwnClub ? context.guestForm : context.homeForm}
                />
              </View>
            </View>
          </View>
        ) : null}

        {/* ── 5. Details ── */}
        <View style={{ marginBottom: spacing.md }}>
          <Text style={[sectionLabelStyle, { marginBottom: spacing.sm }]}>
            {i18n.t("gameDetail.details")}
          </Text>
          <View
            style={{
              backgroundColor: colors.surfaceLowest,
              borderRadius: radius.md,
              padding: spacing.lg,
              gap: spacing.sm,
            }}
          >
            {/* Venue */}
            {venueName ? (
              <View style={detailRowStyle}>
                <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
                  {i18n.t("gameDetail.venue")}
                </Text>
                <Text
                  style={[
                    textStyles.body,
                    { color: colors.foreground, flex: 1, textAlign: "right", marginLeft: spacing.md },
                  ]}
                  numberOfLines={2}
                >
                  {venueName}
                </Text>
              </View>
            ) : null}

            {/* Address */}
            {address ? (
              <View style={detailRowStyle}>
                <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
                  {i18n.t("gameDetail.address")}
                </Text>
                <Text
                  style={[
                    textStyles.body,
                    { color: colors.foreground, flex: 1, textAlign: "right", marginLeft: spacing.md },
                  ]}
                  numberOfLines={2}
                >
                  {address}
                </Text>
              </View>
            ) : null}

            {/* Divider — between venue/address and officials */}
            {(venueName || address) && (match.anschreiber || match.zeitnehmer) ? (
              <View
                style={{
                  height: 1,
                  backgroundColor: colors.border,
                  opacity: 0.25,
                  marginVertical: spacing.xs,
                }}
              />
            ) : null}

            {/* Scorer */}
            {match.anschreiber ? (
              <View style={detailRowStyle}>
                <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
                  {i18n.t("gameDetail.scorer")}
                </Text>
                <Text style={[textStyles.body, { color: colors.foreground }]}>
                  {match.anschreiber}
                </Text>
              </View>
            ) : null}

            {/* Timekeeper */}
            {match.zeitnehmer ? (
              <View style={detailRowStyle}>
                <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
                  {i18n.t("gameDetail.timekeeper")}
                </Text>
                <Text style={[textStyles.body, { color: colors.foreground }]}>
                  {match.zeitnehmer}
                </Text>
              </View>
            ) : null}

            {/* Divider — before status */}
            {(match.anschreiber || match.zeitnehmer || venueName || address) ? (
              <View
                style={{
                  height: 1,
                  backgroundColor: colors.border,
                  opacity: 0.25,
                  marginVertical: spacing.xs,
                }}
              />
            ) : null}

            {/* Status */}
            <View style={[detailRowStyle, { alignItems: "center" }]}>
              <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
                {i18n.t("gameDetail.status")}
              </Text>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
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
            </View>
          </View>
        </View>
      </Screen>
  );
}
