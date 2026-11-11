import { View, Text, ActivityIndicator, Platform, Pressable, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import useSWR from "swr";
import { getNativeTeamColor } from "@dragons/shared";
import { APIError } from "@dragons/api-client";
import { useTheme } from "@/hooks/useTheme";
import { maxFontSizeMultiplierFor, scaledSize } from "@/theme/text-scaling";
import { Screen, UNDER_NATIVE_HEADER } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { QuarterTable } from "@/components/QuarterTable";
import { HeadToHead } from "@/components/HeadToHead";
import { FormStrip } from "@/components/FormStrip";
import { ClubLogo } from "@/components/brand/ClubLogo";
import { publicApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";
import { kickoffCompact, kickoffParts } from "@/lib/format/kickoff";
import { venueBlock } from "@/lib/ui/game-detail";
import { mapsUrl } from "@/lib/referee/einsatz";
import { openExternal } from "@/lib/legal/open-external";

export default function GameDetailScreen() {
  const { colors, textStyles, spacing, radius, isDark, fontFamilies } = useTheme();
  const { fontScale } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const numericId = Number(id);
  const hasValidId = Number.isFinite(numericId) && numericId > 0;

  const {
    data: match,
    isLoading: matchLoading,
    error: matchError,
    mutate: mutateMatch,
  } = useSWR(
    hasValidId ? `match:${id}` : null,
    () => publicApi.getMatch(numericId),
  );
  const { data: context, mutate: mutateContext } = useSWR(
    hasValidId && match ? `match:${id}:context` : null,
    () => publicApi.getMatchContext(numericId),
  );

  const homeName = match
    ? (match.homeTeamCustomName ?? match.homeTeamNameShort ?? match.homeTeamName)
    : "";
  const guestName = match
    ? (match.guestTeamCustomName ?? match.guestTeamNameShort ?? match.guestTeamName)
    : "";

  // Built here, before the loading and error branches, and rendered by all
  // three: attaching header options only once the match arrives reconfigures
  // the native header mid push-transition, which flashes a header overlay.
  const header = (
    <Stack.Screen
      options={{ headerTitle: match ? `${homeName} – ${guestName}` : "" }}
    />
  );

  if (matchLoading) {
    return (
      <>
        {header}
        <Screen edges={UNDER_NATIVE_HEADER}>
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

  if (matchError || !match) {
    const isNotFound =
      !hasValidId ||
      (matchError instanceof APIError && matchError.status === 404);
    const message = isNotFound
      ? i18n.t("gameDetail.notFound")
      : i18n.t("gameDetail.error");
    return (
      <>
        {header}
        <Screen edges={UNDER_NATIVE_HEADER}>
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: spacing.xl,
              paddingTop: spacing.xl,
              gap: spacing.md,
            }}
          >
            <Text
              style={[
                textStyles.body,
                { color: colors.mutedForeground, textAlign: "center" },
              ]}
            >
              {message}
            </Text>
            {!isNotFound ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void mutateMatch();
                }}
                style={{
                  backgroundColor: colors.primary,
                  borderRadius: radius.md,
                  paddingHorizontal: spacing.xl,
                  paddingVertical: spacing.md,
                }}
              >
                <Text style={[textStyles.button, { color: colors.primaryForeground }]}>
                  {i18n.t("gameDetail.retry")}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Screen>
      </>
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

  const venue = venueBlock(match);
  const venueMapsQuery = venue?.mapsQuery ?? null;

  // Date and time on one line, large: the hall has its own group below.
  const kickoff = kickoffParts(match.kickoffDate, match.kickoffTime);
  const kickoffLine = kickoff
    ? [`${kickoff.weekday} ${kickoff.day}`, kickoff.time].filter(Boolean).join(" · ")
    : kickoffCompact(match.kickoffDate, match.kickoffTime);

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
    <>
      {header}
      <Screen
        edges={UNDER_NATIVE_HEADER}
        onRefresh={[() => mutateMatch(), () => mutateContext()]}
      >
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
            {/* Date and time */}
            <Text
              style={{
                fontSize: 20,
                fontFamily: fontFamilies.display,
                fontWeight: "700",
                color: colors.foreground,
                textAlign: "center",
                marginBottom: spacing.sm,
              }}
            >
              {kickoffLine}
            </Text>

            {/* Shown only when it applies; a confirmed game is the normal case
                and says nothing (#408). */}
            {match.isCancelled || match.isForfeited ? (
              <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm }}>
                {match.isCancelled ? (
                  <Badge label={i18n.t("gameDetail.cancelled")} variant="destructive" />
                ) : null}
                {match.isForfeited ? (
                  <Badge label={i18n.t("gameDetail.forfeited")} variant="heat" />
                ) : null}
              </View>
            ) : null}

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
                <ClubLogo clubId={match.homeClubId} size={48} variant="chip" />
                <Text
                  style={[
                    textStyles.cardTitle,
                    {
                      color: match.homeIsOwnClub ? homeColor : colors.mutedForeground,
                      fontFamily: match.homeIsOwnClub
                        ? fontFamilies.bodySemiBold
                        : fontFamilies.body,
                      textAlign: "center",
                      marginTop: spacing.sm,
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
                      maxFontSizeMultiplier={maxFontSizeMultiplierFor("score")}
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
                      maxFontSizeMultiplier={maxFontSizeMultiplierFor("score")}
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
                <ClubLogo clubId={match.guestClubId} size={48} variant="chip" />
                <Text
                  style={[
                    textStyles.cardTitle,
                    {
                      color: match.guestIsOwnClub ? guestColor : colors.mutedForeground,
                      fontFamily: match.guestIsOwnClub
                        ? fontFamilies.bodySemiBold
                        : fontFamilies.body,
                      textAlign: "center",
                      marginTop: spacing.sm,
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
              opponentClubId={match.homeIsOwnClub ? match.guestClubId : match.homeClubId}
              ownLabel={ownLabel}
              ownColor={ownColor}
              onMatchPress={(matchId) => router.push(`/game/${matchId}`)}
            />
          </View>
        ) : null}

        {/* ── 4. Form (Last 5) ── */}
        {/* Kept mounted even with no games played: an empty strip at season
            start is the clean slate, not a missing section (ADR 0007). */}
        {context ? (
          <View style={{ marginBottom: spacing.md }}>
            <Text accessibilityRole="header" style={[sectionLabelStyle, { marginBottom: spacing.sm }]}>
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
                    width: scaledSize(72, fontScale),
                    fontSize: 13,
                    fontFamily: fontFamilies.bodySemiBold,
                    color: match.homeIsOwnClub ? homeColor : guestColor,
                  }}
                  numberOfLines={1}
                >
                  {match.homeIsOwnClub ? homeLabel : guestLabel}
                </Text>
                {(match.homeIsOwnClub ? context.homeForm : context.guestForm).length > 0 ? (
                  <FormStrip
                    form={match.homeIsOwnClub ? context.homeForm : context.guestForm}
                  />
                ) : (
                  <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
                    {i18n.t("gameDetail.noGamesYet")}
                  </Text>
                )}
              </View>
              {/* Opponent form */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Text
                  style={{
                    width: scaledSize(72, fontScale),
                    fontSize: 13,
                    fontFamily: fontFamilies.body,
                    color: colors.mutedForeground,
                  }}
                  numberOfLines={1}
                >
                  {match.homeIsOwnClub ? guestLabel : homeLabel}
                </Text>
                {(match.homeIsOwnClub ? context.guestForm : context.homeForm).length > 0 ? (
                  <FormStrip
                    form={match.homeIsOwnClub ? context.guestForm : context.homeForm}
                  />
                ) : (
                  <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
                    {i18n.t("gameDetail.noGamesYet")}
                  </Text>
                )}
              </View>
            </View>
          </View>
        ) : null}

        {/* ── 5. Halle ── */}
        {venue ? (
          <View style={{ marginBottom: spacing.md }}>
            <Text accessibilityRole="header" style={[sectionLabelStyle, { marginBottom: spacing.sm }]}>
              {i18n.t("gameDetail.venue")}
            </Text>
            <Card
              onPress={
                venueMapsQuery
                  ? () => openExternal(mapsUrl(venueMapsQuery, Platform.OS))
                  : undefined
              }
            >
              <View style={detailRowStyle}>
                <View style={{ flex: 1, gap: spacing.xs }}>
                  {venue.name ? (
                    <Text
                      style={{
                        fontSize: 16,
                        fontFamily: fontFamilies.bodySemiBold,
                        color: colors.foreground,
                      }}
                    >
                      {venue.name}
                    </Text>
                  ) : null}
                  {venue.address ? (
                    <Text style={[textStyles.body, { color: colors.mutedForeground }]}>
                      {venue.address}
                    </Text>
                  ) : null}
                </View>
                {venueMapsQuery ? (
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: fontFamilies.bodySemiBold,
                      color: colors.primary,
                      marginLeft: spacing.md,
                    }}
                  >
                    {i18n.t("gameDetail.route")}
                  </Text>
                ) : null}
              </View>
            </Card>
          </View>
        ) : null}

        {/* ── 6. Kampfgericht ── */}
        {match.anschreiber || match.zeitnehmer ? (
          <View style={{ marginBottom: spacing.md }}>
            <Text accessibilityRole="header" style={[sectionLabelStyle, { marginBottom: spacing.sm }]}>
              {i18n.t("gameDetail.officials")}
            </Text>
            <Card style={{ gap: spacing.sm }}>
              {match.anschreiber ? (
                <View style={detailRowStyle}>
                  <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
                    {i18n.t("gameDetail.scorer")}
                  </Text>
                  <Text
                    style={[
                      textStyles.body,
                      { color: colors.foreground, flex: 1, textAlign: "right", marginLeft: spacing.md },
                    ]}
                  >
                    {match.anschreiber}
                  </Text>
                </View>
              ) : null}
              {match.zeitnehmer ? (
                <View style={detailRowStyle}>
                  <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
                    {i18n.t("gameDetail.timekeeper")}
                  </Text>
                  <Text
                    style={[
                      textStyles.body,
                      { color: colors.foreground, flex: 1, textAlign: "right", marginLeft: spacing.md },
                    ]}
                  >
                    {match.zeitnehmer}
                  </Text>
                </View>
              ) : null}
            </Card>
          </View>
        ) : null}
      </Screen>
    </>
  );
}
