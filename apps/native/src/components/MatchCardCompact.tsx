import { View, Text, Pressable } from "react-native";
import type { MatchListItem } from "@dragons/shared";
import { getNativeTeamColor } from "@dragons/shared";
import { useTheme } from "../hooks/useTheme";
import { i18n } from "../lib/i18n";
import { fontFamilies } from "../theme/typography";
import { ClubLogo } from "./brand/ClubLogo";

interface MatchCardCompactProps {
  match: MatchListItem;
  onPress?: () => void;
  highlighted?: boolean;
}

function getDateLocale(): string {
  return i18n.locale === "de" ? "de-DE" : "en-US";
}

function formatCompactDate(kickoffDate: string, kickoffTime: string): string {
  const d = new Date(kickoffDate + "T00:00:00");
  const weekday = d.toLocaleDateString(getDateLocale(), { weekday: "short" });
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const time = kickoffTime.slice(0, 5);
  return `${weekday} ${day}.${month}. ${time}`;
}

function resolveName(
  customName: string | null,
  nameShort: string | null,
  name: string,
): string {
  return customName || nameShort || name;
}

function getResultBadge(match: MatchListItem): { label: string; variant: "win" | "loss" | "neutral" } | null {
  if (match.isCancelled) return { label: i18n.t("match.cancelled"), variant: "neutral" };
  if (match.isForfeited) return { label: i18n.t("match.forfeited"), variant: "neutral" };
  if (match.homeScore === null || match.guestScore === null) return null;

  const ownIsHome = match.homeIsOwnClub;
  const ownScore = ownIsHome ? match.homeScore : match.guestScore;
  const oppScore = ownIsHome ? match.guestScore : match.homeScore;

  if (ownScore > oppScore) return { label: i18n.t("match.win"), variant: "win" };
  return { label: i18n.t("match.loss"), variant: "loss" };
}

export function MatchCardCompact({ match, onPress, highlighted }: MatchCardCompactProps) {
  const { colors, radius, spacing, isDark } = useTheme();

  const isHomeGame = match.homeIsOwnClub;
  const hasScore = match.homeScore !== null && match.guestScore !== null;

  // Background: home = green tint, away = surfaceLowest
  const cardBg = isHomeGame
    ? isDark
      ? "rgba(0,75,35,0.12)"
      : "rgba(0,75,35,0.06)"
    : colors.surfaceLowest;

  // Own club info
  const ownName = isHomeGame
    ? resolveName(match.homeTeamCustomName, match.homeTeamNameShort, match.homeTeamName)
    : resolveName(match.guestTeamCustomName, match.guestTeamNameShort, match.guestTeamName);
  const ownBadgeColor = isHomeGame ? match.homeBadgeColor : match.guestBadgeColor;
  const ownTeamRawName = isHomeGame ? match.homeTeamName : match.guestTeamName;
  const ownLabel = ownName;

  // Opponent info — use full federation name
  const opponentName = isHomeGame
    ? match.guestTeamName
    : match.homeTeamName;

  const ownColor = getNativeTeamColor(ownBadgeColor, ownTeamRawName, isDark);

  // Score
  const ownScore = isHomeGame ? match.homeScore : match.guestScore;
  const oppScore = isHomeGame ? match.guestScore : match.homeScore;
  const isWin = hasScore && ownScore! > oppScore!;

  const badge = getResultBadge(match);

  // vs / @
  const separator = isHomeGame ? i18n.t("common.vs") : i18n.t("common.at");

  const content = (
    <View
      style={{
        backgroundColor: cardBg,
        borderRadius: radius.md,
        padding: spacing.md,
        borderWidth: highlighted ? 1 : 0,
        borderColor: highlighted ? colors.primary + "60" : "transparent",
      }}
    >
      {/* Date header */}
      <Text
        style={{
          fontSize: 11,
          fontFamily: fontFamilies.body,
          color: colors.mutedForeground,
          marginBottom: spacing.xs,
        }}
      >
        {formatCompactDate(match.kickoffDate, match.kickoffTime)}
      </Text>

      {/* Main row: teams + score + badge */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
          <Text
            style={{
              fontSize: 14,
              fontFamily: fontFamilies.bodySemiBold,
              color: ownColor.name,
            }}
          >
            {ownLabel}
          </Text>
          <Text
            style={{
              fontSize: 12,
              fontFamily: fontFamilies.body,
              color: colors.mutedForeground,
              marginHorizontal: spacing.xs,
            }}
          >
            {separator}
          </Text>
          <ClubLogo
            clubId={isHomeGame ? match.guestClubId : match.homeClubId}
            size={20}
          />
          <Text
            style={{
              fontSize: 14,
              fontFamily: fontFamilies.body,
              color: colors.mutedForeground,
              flex: 1,
              marginLeft: spacing.xs,
            }}
            numberOfLines={1}
          >
            {opponentName}
          </Text>
        </View>

        {/* Score */}
        {hasScore ? (
          <View style={{ flexDirection: "row", alignItems: "center", marginLeft: spacing.sm }}>
            <Text
              style={{
                color: isWin ? colors.foreground : colors.mutedForeground,
                fontSize: 14,
                fontWeight: isWin ? "700" : "400",
                fontFamily: isWin ? fontFamilies.bodySemiBold : fontFamilies.body,
              }}
            >
              {ownScore}
            </Text>
            <Text style={{ color: colors.mutedForeground, marginHorizontal: 2 }}>:</Text>
            <Text
              style={{
                color: !isWin ? colors.foreground : colors.mutedForeground,
                fontSize: 14,
                fontWeight: !isWin ? "700" : "400",
                fontFamily: !isWin ? fontFamilies.bodySemiBold : fontFamilies.body,
              }}
            >
              {oppScore}
            </Text>
          </View>
        ) : null}

        {/* Badge */}
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
              paddingHorizontal: 4,
              paddingVertical: 1,
              marginLeft: spacing.sm,
            }}
          >
            <Text
              style={{
                fontSize: 9,
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
