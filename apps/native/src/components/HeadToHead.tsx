import { View, Text, Pressable } from "react-native";
import type { HeadToHead as HeadToHeadData } from "@dragons/shared";
import { useTheme } from "../hooks/useTheme";
import { i18n } from "../lib/i18n";
import { fontFamilies } from "../theme/typography";
import { ClubLogo } from "./brand/ClubLogo";

interface HeadToHeadProps {
  data: HeadToHeadData;
  opponentName: string;
  opponentClubId?: number;
  ownLabel: string;
  ownColor: string;
  onMatchPress?: (matchId: number) => void;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const year = d.getFullYear().toString().slice(2);
  return `${day}.${month}.${year}`;
}

export function HeadToHead({
  data,
  opponentName,
  opponentClubId,
  ownLabel,
  ownColor,
  onMatchPress,
}: HeadToHeadProps) {
  const { colors, spacing, radius } = useTheme();

  const sectionLabelStyle = {
    fontSize: 11,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    color: colors.mutedForeground,
    fontFamily: fontFamilies.displayMedium,
  };

  const meetings = data.previousMeetings.slice(0, 5);

  return (
    <View>
      {/* Section label with opponent logo */}
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
        <Text style={sectionLabelStyle}>
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
            {i18n.t("standings.won")}
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
            {i18n.t("standings.lost")}
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
            {data.pointsFor}
          </Text>
          <Text style={[sectionLabelStyle, { marginTop: spacing.xs }]}>
            {i18n.t("gameDetail.pointsFor")}
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
            {data.pointsAgainst}
          </Text>
          <Text style={[sectionLabelStyle, { marginTop: spacing.xs }]}>
            {i18n.t("gameDetail.pointsAgainst")}
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
                    width: 58,
                  }}
                >
                  {formatDate(meeting.date)}
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

                {/* S/N badge */}
                <View
                  style={{
                    backgroundColor: isWinner
                      ? colors.chart1 + "1A"
                      : colors.destructive + "1A",
                    borderRadius: radius.md,
                    paddingHorizontal: 4,
                    paddingVertical: 1,
                    marginLeft: spacing.xs,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 9,
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
                  style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
                >
                  {row}
                </Pressable>
              );
            }

            return <View key={meeting.matchId}>{row}</View>;
          })}
        </View>
      ) : null}
    </View>
  );
}
