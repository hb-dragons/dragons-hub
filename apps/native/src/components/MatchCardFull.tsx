import { View, Text, Pressable } from "react-native";
import type { MatchListItem } from "@dragons/shared";
import { getNativeTeamColor } from "@dragons/shared";
import { useTheme } from "../hooks/useTheme";
import { i18n } from "../lib/i18n";
import { fontFamilies } from "../theme/typography";
import { ClubLogo } from "./brand/ClubLogo";

interface MatchCardFullProps {
  match: MatchListItem;
  onPress?: () => void;
}

function getDateLocale(): string {
  return i18n.locale === "de" ? "de-DE" : "en-US";
}

function formatHeaderDate(kickoffDate: string, kickoffTime: string): string {
  const d = new Date(kickoffDate + "T00:00:00");
  const weekday = d.toLocaleDateString(getDateLocale(), { weekday: "short" });
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const time = kickoffTime.slice(0, 5);
  return `${weekday} ${day}.${month}. ${time}`;
}

function getResultBadge(match: MatchListItem): { label: string; variant: "win" | "loss" | "neutral" } | null {
  if (match.isCancelled) return { label: i18n.t("match.cancelled"), variant: "neutral" };
  if (match.isForfeited) return { label: i18n.t("match.forfeited"), variant: "neutral" };
  if (match.homeScore === null || match.guestScore === null) {
    return { label: i18n.t("match.upcoming"), variant: "neutral" };
  }

  const ownIsHome = match.homeIsOwnClub;
  const ownScore = ownIsHome ? match.homeScore : match.guestScore;
  const oppScore = ownIsHome ? match.guestScore : match.homeScore;

  if (ownScore > oppScore) return { label: i18n.t("match.win"), variant: "win" };
  return { label: i18n.t("match.loss"), variant: "loss" };
}

function resolveName(
  customName: string | null,
  nameShort: string | null,
  name: string,
): string {
  return customName || nameShort || name;
}

export function MatchCardFull({ match, onPress }: MatchCardFullProps) {
  const { colors, radius, spacing, isDark } = useTheme();

  const isHomeGame = match.homeIsOwnClub;
  const isCancelled = match.isCancelled ?? false;
  const hasScore = match.homeScore !== null && match.guestScore !== null;

  // Background: home = green tint, away = surfaceLowest
  const cardBg = isHomeGame
    ? isDark
      ? "rgba(0,75,35,0.12)"
      : "rgba(0,75,35,0.06)"
    : colors.surfaceLowest;

  const homeName = match.homeIsOwnClub
    ? resolveName(match.homeTeamCustomName, match.homeTeamNameShort, match.homeTeamName)
    : match.homeTeamName;
  const guestName = match.guestIsOwnClub
    ? resolveName(match.guestTeamCustomName, match.guestTeamNameShort, match.guestTeamName)
    : match.guestTeamName;

  // Team colors via getNativeTeamColor
  const homeTeamColor = getNativeTeamColor(match.homeBadgeColor, match.homeTeamName, isDark);
  const guestTeamColor = getNativeTeamColor(match.guestBadgeColor, match.guestTeamName, isDark);

  const venueName = match.venueNameOverride || match.venueName;

  // Score styling: winner = bold+bright, loser = muted
  const homeIsWinner = hasScore && match.homeScore! > match.guestScore!;
  const guestIsWinner = hasScore && match.guestScore! > match.homeScore!;

  const badge = getResultBadge(match);

  const content = (
    <View
      style={{
        backgroundColor: cardBg,
        borderRadius: radius.md,
        padding: spacing.lg,
        opacity: isCancelled ? 0.7 : 1,
      }}
    >
      {/* Header: date + time + venue + result badge */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: spacing.sm,
        }}
      >
        <Text
          style={{
            fontSize: 12,
            fontFamily: fontFamilies.body,
            color: colors.mutedForeground,
          }}
          numberOfLines={1}
        >
          {formatHeaderDate(match.kickoffDate, match.kickoffTime)}
          {venueName ? ` \u2022 ${venueName}` : ""}
        </Text>

        {badge ? (
          <View
            style={{
              backgroundColor:
                badge.variant === "win"
                  ? colors.chart1 + "1A"
                  : badge.variant === "loss"
                    ? colors.destructive + "1A"
                    : colors.muted,
              borderRadius: radius.md,
              paddingHorizontal: 6,
              paddingVertical: 2,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: "700",
                color:
                  badge.variant === "win"
                    ? colors.chart1
                    : badge.variant === "loss"
                      ? colors.destructive
                      : colors.mutedForeground,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {badge.label}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Home team row */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: spacing.xs,
        }}
      >
        <ClubLogo clubId={match.homeClubId} size={28} />
        <Text
          style={{
            flex: 1,
            fontSize: 15,
            fontFamily: match.homeIsOwnClub
              ? fontFamilies.bodySemiBold
              : fontFamilies.body,
            color: match.homeIsOwnClub
              ? homeTeamColor.name
              : colors.mutedForeground,
            textDecorationLine: isCancelled ? "line-through" : "none",
            marginLeft: spacing.sm,
          }}
          numberOfLines={1}
        >
          {homeName}
        </Text>
        <Text
          style={{
            fontSize: 18,
            fontFamily: homeIsWinner ? fontFamilies.display : fontFamilies.body,
            fontWeight: homeIsWinner ? "700" : "400",
            color: homeIsWinner ? colors.foreground : colors.mutedForeground,
            marginLeft: spacing.md,
            minWidth: 28,
            textAlign: "right",
          }}
        >
          {hasScore ? match.homeScore : "—"}
        </Text>
      </View>

      {/* Guest team row */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <ClubLogo clubId={match.guestClubId} size={28} />
        <Text
          style={{
            flex: 1,
            fontSize: 15,
            fontFamily: match.guestIsOwnClub
              ? fontFamilies.bodySemiBold
              : fontFamilies.body,
            color: match.guestIsOwnClub
              ? guestTeamColor.name
              : colors.mutedForeground,
            textDecorationLine: isCancelled ? "line-through" : "none",
            marginLeft: spacing.sm,
          }}
          numberOfLines={1}
        >
          {guestName}
        </Text>
        <Text
          style={{
            fontSize: 18,
            fontFamily: guestIsWinner ? fontFamilies.display : fontFamilies.body,
            fontWeight: guestIsWinner ? "700" : "400",
            color: guestIsWinner ? colors.foreground : colors.mutedForeground,
            marginLeft: spacing.md,
            minWidth: 28,
            textAlign: "right",
          }}
        >
          {hasScore ? match.guestScore : "—"}
        </Text>
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}
