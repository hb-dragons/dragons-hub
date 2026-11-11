import { memo } from "react";
import { View, Text, Pressable } from "react-native";
import type { MatchListItem } from "@dragons/shared";
import { getNativeTeamColor } from "@dragons/shared";
import { useTheme } from "../hooks/useTheme";
import { i18n } from "../lib/i18n";
import { kickoffParts } from "../lib/format/kickoff";
import { matchA11yLabel } from "../lib/ui/match-a11y";
import { matchCardModel, scoreLine } from "../lib/ui/match-card";
import { ClubLogo } from "./brand/ClubLogo";

interface MatchCardScheduleProps {
  match: MatchListItem;
  onPress?: (match: MatchListItem) => void;
  /**
   * Which half of the kickoff is set large. A list of games is scanned by
   * date; the single next game on Home is about when to be there.
   */
  emphasis?: "date" | "time";
}

/**
 * The Spielplan card (#408): kickoff on the top line, the club's squad as a
 * small overline, and the opponent's full name across the whole card width —
 * federation names run to 40 characters, and a side column left them no room.
 * The venue is on the game detail, not here.
 */
function MatchCardScheduleImpl({ match, onPress, emphasis = "date" }: MatchCardScheduleProps) {
  const { colors, radius, spacing, isDark, fontFamilies } = useTheme();

  const model = matchCardModel(match);
  const kickoff = kickoffParts(match.kickoffDate, match.kickoffTime);
  const score = scoreLine(model);
  const isCancelled = model.outcome === "cancelled";
  const isUpcoming = model.outcome === "upcoming";

  // Home games still ahead carry the green tint; a played game is a result,
  // and where it was played no longer matters.
  const cardBg =
    model.isHome && isUpcoming
      ? isDark
        ? "rgba(0,75,35,0.12)"
        : "rgba(0,75,35,0.06)"
      : colors.surfaceLowest;

  const ownColor = getNativeTeamColor(model.ownBadgeColor, model.ownRawName, isDark).name;

  const large = {
    fontFamily: fontFamilies.display,
    fontWeight: "700" as const,
    color: colors.foreground,
  };
  const small = {
    fontSize: 14,
    fontFamily: fontFamilies.bodySemiBold,
    color: colors.mutedForeground,
  };

  // An unparseable date falls back to the raw string rather than a blank line.
  const timeFirst = emphasis === "time" && kickoff?.time;
  const primary = kickoff ? (timeFirst ? kickoff.time : kickoff.day) : match.kickoffDate;
  const secondary = kickoff
    ? timeFirst
      ? `${kickoff.weekday} ${kickoff.day}`
      : [kickoff.weekday, model.hasScore ? null : kickoff.time].filter(Boolean).join(" ")
    : null;

  let corner;
  if (model.outcome === "win" || model.outcome === "loss") {
    const tone = model.outcome === "win" ? colors.chart1 : colors.destructive;
    corner = (
      <View
        style={{
          backgroundColor: tone + "1A",
          borderRadius: radius.md,
          paddingHorizontal: spacing.sm,
          paddingVertical: 2,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: "700", color: tone, letterSpacing: 0.5 }}>
          {i18n.t(model.outcome === "win" ? "match.win" : "match.loss")}
        </Text>
      </View>
    );
  } else if (isUpcoming) {
    corner = (
      <View
        style={{
          backgroundColor: model.isHome ? colors.primary : "transparent",
          borderColor: model.isHome ? colors.primary : colors.border,
          borderWidth: 1,
          borderRadius: radius.pill,
          paddingHorizontal: 9,
          paddingVertical: 2,
        }}
      >
        <Text
          style={{
            fontSize: 12,
            fontFamily: fontFamilies.bodySemiBold,
            color: model.isHome ? colors.primaryForeground : colors.mutedForeground,
          }}
        >
          {i18n.t(model.isHome ? "common.home" : "common.away")}
        </Text>
      </View>
    );
  } else {
    corner = (
      <View
        style={{
          backgroundColor: colors.muted,
          borderRadius: radius.md,
          paddingHorizontal: spacing.sm,
          paddingVertical: 2,
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: "700", color: colors.mutedForeground }}>
          {i18n.t(isCancelled ? "gameDetail.cancelled" : "gameDetail.forfeited")}
        </Text>
      </View>
    );
  }

  const content = (
    <View
      style={{
        backgroundColor: cardBg,
        borderRadius: radius.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        gap: spacing.xs,
        opacity: isCancelled ? 0.7 : 1,
      }}
    >
      {/* Kickoff + home/away or result */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        {/* Wraps under itself at large text sizes instead of pushing the chip out. */}
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "baseline",
            columnGap: spacing.sm,
          }}
        >
          <Text style={[large, { fontSize: timeFirst ? 30 : 18 }]}>{primary}</Text>
          {secondary ? <Text style={small}>{secondary}</Text> : null}
        </View>
        {corner}
      </View>

      {/* Own squad */}
      <Text
        style={{ fontSize: 13, fontFamily: fontFamilies.bodySemiBold, color: ownColor }}
        numberOfLines={1}
      >
        {model.ownName}
      </Text>

      {/* Opponent, full width */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <ClubLogo clubId={model.opponentClubId} size={28} />
        <Text
          style={{
            flex: 1,
            fontSize: 16,
            fontFamily: fontFamilies.bodySemiBold,
            color: colors.foreground,
            textDecorationLine: isCancelled ? "line-through" : "none",
          }}
          // Three lines hold the longest federation name at the default size;
          // the card grows instead of cutting the name off.
          numberOfLines={3}
        >
          {model.opponentName}
        </Text>
        {score ? <Text style={[large, { fontSize: 18 }]}>{score}</Text> : null}
      </View>
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={() => onPress(match)}
      accessibilityRole="button"
      accessibilityLabel={matchA11yLabel({
        homeName: model.homeName,
        guestName: model.guestName,
        homeScore: match.homeScore,
        guestScore: match.guestScore,
        kickoffDate: match.kickoffDate,
        kickoffTime: match.kickoffTime,
        isCancelled: match.isCancelled,
        isForfeited: match.isForfeited,
        ownSide: model.ownSide,
      })}
      style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
    >
      {content}
    </Pressable>
  );
}

export const MatchCardSchedule = memo(MatchCardScheduleImpl);
