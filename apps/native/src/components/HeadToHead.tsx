import { View, Text, Pressable, useWindowDimensions } from "react-native";
import type { HeadToHead as HeadToHeadData } from "@dragons/shared";
import { useTheme } from "../hooks/useTheme";
import { i18n } from "../lib/i18n";
import { kickoffShortNumeric } from "../lib/format/kickoff";
import { matchA11yLabel } from "../lib/ui/match-a11y";
import { headToHeadAverages } from "../lib/ui/game-detail";
import { scaledSize } from "../theme/text-scaling";
import { ClubLogo } from "./brand/ClubLogo";

interface HeadToHeadProps {
  data: HeadToHeadData;
  opponentName: string;
  opponentClubId?: number;
  ownLabel: string;
  ownColor: string;
  onMatchPress?: (matchId: number) => void;
}

export function HeadToHead({
  data,
  opponentName,
  opponentClubId,
  ownLabel,
  ownColor,
  onMatchPress,
}: HeadToHeadProps) {
  const { colors, spacing, radius, fontFamilies } = useTheme();
  const { fontScale } = useWindowDimensions();

  const sectionLabelStyle = {
    fontSize: 11,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    color: colors.mutedForeground,
    fontFamily: fontFamilies.displayMedium,
  };

  const meetings = data.previousMeetings.slice(0, 5);
  // Points per game rather than season totals (#408).
  const { avgFor, avgAgainst } = headToHeadAverages(data);

  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: spacing.sm,
        }}
      >
        {opponentClubId ? (
          <View style={{ marginRight: spacing.xs }}>
            <ClubLogo clubId={opponentClubId} size={18} />
          </View>
        ) : null}
        <Text accessibilityRole="header" style={sectionLabelStyle}>
          {i18n.t("gameDetail.record", { opponent: opponentName })}
        </Text>
      </View>

      {/* Stats row */}
      <View
        style={{
          flexDirection: "row",
          backgroundColor: colors.surfaceLowest,
          borderRadius: radius.md,
          padding: spacing.lg,
          marginBottom: spacing.sm,
        }}
      >
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text
            style={{
              fontSize: 20,
              fontFamily: fontFamilies.display,
              color: colors.chart1,
            }}
          >
            {data.wins}
          </Text>
          <Text style={[sectionLabelStyle, { marginTop: spacing.xs }]}>
            {i18n.t("match.win")}
          </Text>
        </View>

        <View style={{ flex: 1, alignItems: "center" }}>
          <Text
            style={{
              fontSize: 20,
              fontFamily: fontFamilies.display,
              color: colors.destructive,
            }}
          >
            {data.losses}
          </Text>
          <Text style={[sectionLabelStyle, { marginTop: spacing.xs }]}>
            {i18n.t("match.loss")}
          </Text>
        </View>

        <View style={{ flex: 1, alignItems: "center" }}>
          <Text
            style={{
              fontSize: 20,
              fontFamily: fontFamilies.display,
              color: colors.foreground,
            }}
          >
            {avgFor ?? "–"}
          </Text>
          <Text style={[sectionLabelStyle, { marginTop: spacing.xs }]}>
            {i18n.t("gameDetail.avgFor")}
          </Text>
        </View>

        <View style={{ flex: 1, alignItems: "center" }}>
          <Text
            style={{
              fontSize: 20,
              fontFamily: fontFamilies.display,
              color: colors.foreground,
            }}
          >
            {avgAgainst ?? "–"}
          </Text>
          <Text style={[sectionLabelStyle, { marginTop: spacing.xs }]}>
            {i18n.t("gameDetail.avgAgainst")}
          </Text>
        </View>
      </View>

      {/* Previous meetings */}
      {meetings.length > 0 ? (
        <View
          style={{
            backgroundColor: colors.surfaceLowest,
            borderRadius: radius.md,
            overflow: "hidden",
          }}
        >
          {meetings.map((meeting, index) => {
            const isWinner =
              (meeting.homeIsOwnClub && meeting.homeScore > meeting.guestScore) ||
              (!meeting.homeIsOwnClub && meeting.guestScore > meeting.homeScore);
            const isHomeWin = meeting.homeScore > meeting.guestScore;

            const row = (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.lg,
                  borderTopWidth: index > 0 ? 1 : 0,
                  borderTopColor: colors.border + "40",
                }}
              >
                {/* Date */}
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: fontFamilies.body,
                    color: colors.mutedForeground,
                    width: scaledSize(58, fontScale),
                  }}
                >
                  {kickoffShortNumeric(meeting.date)}
                </Text>

                {/* Home team */}
                <Text
                  style={{
                    flex: 1,
                    fontSize: 13,
                    fontFamily: meeting.homeIsOwnClub
                      ? fontFamilies.bodySemiBold
                      : fontFamilies.body,
                    color: meeting.homeIsOwnClub ? ownColor : colors.mutedForeground,
                    textAlign: "right",
                  }}
                  numberOfLines={1}
                >
                  {meeting.homeIsOwnClub ? ownLabel : opponentName}
                </Text>

                {/* Score */}
                <View style={{ flexDirection: "row", marginHorizontal: spacing.sm }}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: isHomeWin ? fontFamilies.bodySemiBold : fontFamilies.body,
                      color: isHomeWin ? colors.foreground : colors.mutedForeground,
                    }}
                  >
                    {meeting.homeScore}
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: colors.mutedForeground,
                      marginHorizontal: 2,
                    }}
                  >
                    :
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: !isHomeWin ? fontFamilies.bodySemiBold : fontFamilies.body,
                      color: !isHomeWin ? colors.foreground : colors.mutedForeground,
                    }}
                  >
                    {meeting.guestScore}
                  </Text>
                </View>

                {/* Guest team */}
                <Text
                  style={{
                    flex: 1,
                    fontSize: 13,
                    fontFamily: !meeting.homeIsOwnClub
                      ? fontFamilies.bodySemiBold
                      : fontFamilies.body,
                    color: !meeting.homeIsOwnClub ? ownColor : colors.mutedForeground,
                  }}
                  numberOfLines={1}
                >
                  {!meeting.homeIsOwnClub ? ownLabel : opponentName}
                </Text>

                {/* W/L badge */}
                <View
                  style={{
                    backgroundColor: isWinner
                      ? colors.chart1 + "1A"
                      : colors.destructive + "1A",
                    borderRadius: radius.md,
                    paddingHorizontal: 6,
                    paddingVertical: 1,
                    marginLeft: spacing.xs,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "700",
                      color: isWinner ? colors.chart1 : colors.destructive,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    {isWinner ? i18n.t("match.win") : i18n.t("match.loss")}
                  </Text>
                </View>
              </View>
            );

            if (onMatchPress) {
              return (
                <Pressable
                  key={meeting.matchId}
                  onPress={() => onMatchPress(meeting.matchId)}
                  accessibilityRole="button"
                  accessibilityLabel={matchA11yLabel({
                    homeName: meeting.homeIsOwnClub ? ownLabel : opponentName,
                    guestName: meeting.homeIsOwnClub ? opponentName : ownLabel,
                    homeScore: meeting.homeScore,
                    guestScore: meeting.guestScore,
                    kickoffDate: meeting.date,
                    ownSide: meeting.homeIsOwnClub ? "home" : "guest",
                  })}
                  style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
                >
                  {row}
                </Pressable>
              );
            }

            return <View key={meeting.matchId}>{row}</View>;
          })}
        </View>
      ) : (
        <View
          style={{
            backgroundColor: colors.surfaceLowest,
            borderRadius: radius.md,
            padding: spacing.lg,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontFamily: fontFamilies.body,
              color: colors.mutedForeground,
            }}
          >
            {i18n.t("gameDetail.noMeetings")}
          </Text>
        </View>
      )}
    </View>
  );
}
