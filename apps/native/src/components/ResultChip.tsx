import { View, Text, Pressable } from "react-native";
import type { MatchListItem } from "@dragons/shared";
import { useTheme } from "../hooks/useTheme";
import { i18n } from "../lib/i18n";
import { fontFamilies } from "../theme/typography";

interface ResultChipProps {
  match: MatchListItem;
  onPress?: () => void;
}

function getOpponentName(match: MatchListItem): string {
  return match.homeIsOwnClub ? match.guestTeamName : match.homeTeamName;
}

function getResultBadge(match: MatchListItem): { label: string; isWin: boolean | null } {
  if (match.isCancelled) return { label: i18n.t("match.cancelled"), isWin: null };
  if (match.isForfeited) return { label: i18n.t("match.forfeited"), isWin: null };
  if (match.homeScore === null || match.guestScore === null) {
    return { label: i18n.t("match.upcoming"), isWin: null };
  }

  const ownScore = match.homeIsOwnClub ? match.homeScore : match.guestScore;
  const oppScore = match.homeIsOwnClub ? match.guestScore : match.homeScore;
  const isWin = ownScore > oppScore;
  return {
    label: isWin ? i18n.t("match.win") : i18n.t("match.loss"),
    isWin,
  };
}

export function ResultChip({ match, onPress }: ResultChipProps) {
  const { colors, radius, spacing } = useTheme();

  const opponentLabel = getOpponentName(match);
  const hasScore = match.homeScore !== null && match.guestScore !== null;
  const ownScore = match.homeIsOwnClub ? match.homeScore : match.guestScore;
  const oppScore = match.homeIsOwnClub ? match.guestScore : match.homeScore;
  const { label: badgeLabel, isWin } = getResultBadge(match);

  const content = (
    <View
      style={{
        backgroundColor: colors.surfaceLowest,
        borderRadius: radius.md,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        alignItems: "center",
        minWidth: 60,
        maxWidth: 80,
      }}
    >
      {/* Opponent name */}
      <Text
        style={{
          fontSize: 10,
          fontFamily: fontFamilies.displayMedium,
          color: colors.mutedForeground,
        }}
        numberOfLines={1}
      >
        {opponentLabel}
      </Text>

      {/* Own score */}
      {hasScore ? (
        <Text
          style={{
            fontSize: 16,
            fontFamily: isWin ? fontFamilies.display : fontFamilies.body,
            color: isWin ? colors.foreground : colors.mutedForeground,
            fontWeight: isWin ? "700" : "400",
          }}
        >
          {ownScore}
        </Text>
      ) : (
        <Text style={{ fontSize: 16, color: colors.mutedForeground }}>—</Text>
      )}

      {/* Opponent score */}
      {hasScore ? (
        <Text
          style={{
            fontSize: 13,
            fontFamily: !isWin ? fontFamilies.display : fontFamilies.body,
            color: !isWin ? colors.foreground : colors.mutedForeground,
            fontWeight: !isWin ? "700" : "400",
          }}
        >
          {oppScore}
        </Text>
      ) : null}

      {/* S/N badge */}
      <View
        style={{
          marginTop: spacing.xs,
          backgroundColor:
            isWin === true
              ? colors.chart1 + "1A"
              : isWin === false
                ? colors.destructive + "1A"
                : colors.muted,
          borderRadius: radius.md,
          paddingHorizontal: 4,
          paddingVertical: 1,
        }}
      >
        <Text
          style={{
            fontSize: 9,
            fontWeight: "700",
            color:
              isWin === true
                ? colors.chart1
                : isWin === false
                  ? colors.destructive
                  : colors.mutedForeground,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {badgeLabel}
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
