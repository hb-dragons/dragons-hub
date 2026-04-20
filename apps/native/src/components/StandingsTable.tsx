import { memo, useCallback } from "react";
import { View, Text, Pressable } from "react-native";
import type { StandingItem } from "@dragons/shared";
import { getNativeTeamColor } from "@dragons/shared";
import { useTheme } from "../hooks/useTheme";
import { i18n } from "../lib/i18n";
import { fontFamilies } from "../theme/typography";
import { ClubLogo } from "./brand/ClubLogo";

interface StandingsTableProps {
  standings: StandingItem[];
  leagueName: string;
  seasonName?: string;
  teamColors?: Record<string, string | null>;
  onOwnClubPress?: (teamName: string) => void;
  onOpponentPress?: (teamName: string) => void;
}

export function StandingsTable({
  standings,
  leagueName,
  seasonName,
  teamColors,
  onOwnClubPress,
  onOpponentPress,
}: StandingsTableProps) {
  const { colors, spacing, radius } = useTheme();

  const sectionLabelStyle = {
    fontSize: 11,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    color: colors.mutedForeground,
    fontFamily: fontFamilies.displayMedium,
  };

  const headerCellStyle = {
    ...sectionLabelStyle,
    textAlign: "center" as const,
  };

  return (
    <View>
      {/* League header card */}
      <View
        style={{
          backgroundColor: colors.surfaceLowest,
          borderRadius: radius.md,
          padding: spacing.lg,
          marginBottom: spacing.sm,
        }}
      >
        <Text
          style={{
            fontSize: 16,
            fontFamily: fontFamilies.display,
            color: colors.foreground,
          }}
          numberOfLines={1}
        >
          {leagueName}
        </Text>
        {seasonName ? (
          <Text
            style={{
              fontSize: 13,
              fontFamily: fontFamilies.body,
              color: colors.mutedForeground,
              marginTop: spacing.xs,
            }}
          >
            {seasonName}
          </Text>
        ) : null}
      </View>

      {/* Table */}
      <View
        style={{
          backgroundColor: colors.surfaceLowest,
          borderRadius: radius.md,
          overflow: "hidden",
        }}
      >
        {/* Column headers */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: colors.border + "40",
          }}
        >
          <Text style={[headerCellStyle, { width: 28 }]}>
            {i18n.t("standings.pos")}
          </Text>
          <Text
            style={[
              sectionLabelStyle,
              { flex: 1, marginLeft: spacing.sm },
            ]}
          >
            {i18n.t("standings.team")}
          </Text>
          <Text style={[headerCellStyle, { width: 28 }]}>
            {i18n.t("standings.played")}
          </Text>
          <Text style={[headerCellStyle, { width: 24 }]}>
            {i18n.t("standings.won")}
          </Text>
          <Text style={[headerCellStyle, { width: 24 }]}>
            {i18n.t("standings.lost")}
          </Text>
          <Text style={[headerCellStyle, { width: 36 }]}>
            {i18n.t("standings.diff")}
          </Text>
          <Text style={[headerCellStyle, { width: 32, textAlign: "right" }]}>
            {i18n.t("standings.points")}
          </Text>
        </View>

        {/* Rows */}
        {standings.map((item) => {
          const isOwn = item.isOwnClub;
          const badgeColor = teamColors?.[item.teamName] ?? null;
          const onPress = isOwn ? onOwnClubPress : onOpponentPress;
          return (
            <StandingRow
              key={`${item.position}-${item.teamName}`}
              item={item}
              isOwn={isOwn}
              badgeColor={badgeColor}
              onPress={onPress}
            />
          );
        })}
      </View>
    </View>
  );
}

interface StandingRowProps {
  item: StandingItem;
  isOwn: boolean;
  badgeColor: string | null;
  onPress?: (teamName: string) => void;
}

function StandingRowImpl({ item, isOwn, badgeColor, onPress }: StandingRowProps) {
  const { colors, spacing, isDark } = useTheme();

  const rowBg = isOwn ? colors.primary + "0D" : "transparent";
  const leftBorderWidth = isOwn ? 2 : 0;
  const leftBorderColor = colors.primary + "80";

  // Diff color
  const diffColor =
    item.pointsDiff > 0
      ? colors.chart1
      : item.pointsDiff < 0
        ? colors.destructive
        : colors.mutedForeground;

  const diffPrefix = item.pointsDiff > 0 ? "+" : "";

  // Team name color: own = badge color (primary), opponent = neutral
  const teamColor = isOwn
    ? getNativeTeamColor(badgeColor, item.teamName, isDark).name
    : colors.foreground;

  const handlePress = useCallback(() => {
    onPress?.(item.teamName);
  }, [onPress, item.teamName]);

  const row = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        backgroundColor: rowBg,
        borderLeftWidth: leftBorderWidth,
        borderLeftColor: leftBorderColor,
      }}
    >
      {/* Position */}
      <Text
        style={{
          width: 28,
          textAlign: "center",
          fontSize: 13,
          fontFamily: fontFamilies.body,
          color: colors.mutedForeground,
        }}
      >
        {item.position}
      </Text>

      <View
        style={{
          flex: 1,
          marginLeft: spacing.sm,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <ClubLogo clubId={item.clubId} size={20} />
        <Text
          style={{
            flex: 1,
            marginLeft: spacing.xs,
            fontSize: 13,
            fontFamily: isOwn ? fontFamilies.bodySemiBold : fontFamilies.body,
            color: teamColor,
          }}
          numberOfLines={1}
        >
          {isOwn ? (item.teamNameShort || item.teamName) : item.teamName}
        </Text>
      </View>

      {/* Played */}
      <Text
        style={{
          width: 28,
          textAlign: "center",
          fontSize: 13,
          fontFamily: fontFamilies.body,
          color: colors.foreground,
        }}
      >
        {item.played}
      </Text>

      {/* Won */}
      <Text
        style={{
          width: 24,
          textAlign: "center",
          fontSize: 13,
          fontFamily: fontFamilies.body,
          color: colors.foreground,
        }}
      >
        {item.won}
      </Text>

      {/* Lost */}
      <Text
        style={{
          width: 24,
          textAlign: "center",
          fontSize: 13,
          fontFamily: fontFamilies.body,
          color: colors.foreground,
        }}
      >
        {item.lost}
      </Text>

      {/* Diff */}
      <Text
        style={{
          width: 36,
          textAlign: "center",
          fontSize: 13,
          fontFamily: fontFamilies.body,
          color: diffColor,
        }}
      >
        {diffPrefix}{item.pointsDiff}
      </Text>

      {/* Points */}
      <Text
        style={{
          width: 32,
          textAlign: "right",
          fontSize: 13,
          fontFamily: fontFamilies.bodySemiBold,
          color: colors.foreground,
        }}
      >
        {item.leaguePoints}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
      >
        {row}
      </Pressable>
    );
  }

  return <View>{row}</View>;
}

const StandingRow = memo(StandingRowImpl);
