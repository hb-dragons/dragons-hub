import { memo, useCallback } from "react";
import { View, Text, Pressable, useWindowDimensions } from "react-native";
import type { StandingItem } from "@dragons/shared";
import { getNativeTeamColor } from "@dragons/shared";
import { useTheme } from "../hooks/useTheme";
import { i18n } from "../lib/i18n";
import { standingA11yLabel } from "../lib/ui/standing-a11y";
import {
  standingStatCells,
  standingStatHeadings,
  type StandingStatKey,
} from "../lib/ui/standing-cells";
import {
  maxFontSizeMultiplierFor,
  scaledSize,
  tableLayoutFor,
  type TableLayout,
} from "../theme/text-scaling";
import { ClubLogo } from "./brand/ClubLogo";

interface StandingsTableProps {
  standings: StandingItem[];
  leagueName: string;
  seasonName?: string;
  /** Badge colours keyed by `teamApiId` — team names are not unique. */
  teamColors?: Record<number, string | null>;
  onOwnClubPress?: (teamApiId: number) => void;
  onOpponentPress?: (teamApiId: number) => void;
}

/**
 * Minimum column widths at the default text size, in points. They grow with
 * the text (`scaledSize`) so header and rows stay aligned, and are minimums,
 * not widths, so a value wider than its column pushes the team name instead
 * of clipping.
 */
const POSITION_MIN_WIDTH = 28;
const STAT_MIN_WIDTH: Record<StandingStatKey, number> = {
  played: 28,
  won: 24,
  lost: 24,
  diff: 36,
  points: 32,
};

const TABLE_HEADER_CAP = maxFontSizeMultiplierFor("tableHeader");

export function StandingsTable({
  standings,
  leagueName,
  seasonName,
  teamColors,
  onOwnClubPress,
  onOpponentPress,
}: StandingsTableProps) {
  const { colors, spacing, radius, fontFamilies } = useTheme();
  const { fontScale } = useWindowDimensions();
  const layout = tableLayoutFor(fontScale);

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

  const statHeadings = standingStatHeadings((key, options) => i18n.t(key, options));

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
          accessibilityRole="header"
          style={{
            fontSize: 16,
            fontFamily: fontFamilies.display,
            color: colors.foreground,
          }}
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
        {/* Column headers. The stacked layout prints each heading next to
            its value instead, so it has no header row. */}
        {layout === "columns" ? (
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
            <Text
              maxFontSizeMultiplier={TABLE_HEADER_CAP}
              style={[headerCellStyle, { minWidth: scaledSize(POSITION_MIN_WIDTH, fontScale) }]}
            >
              {i18n.t("standings.pos")}
            </Text>
            <Text
              maxFontSizeMultiplier={TABLE_HEADER_CAP}
              style={[sectionLabelStyle, { flex: 1, marginLeft: spacing.sm }]}
            >
              {i18n.t("standings.team")}
            </Text>
            {statHeadings.map((cell) => (
              <Text
                key={cell.key}
                maxFontSizeMultiplier={TABLE_HEADER_CAP}
                style={[
                  headerCellStyle,
                  {
                    minWidth: scaledSize(STAT_MIN_WIDTH[cell.key], fontScale),
                    textAlign: cell.key === "points" ? "right" : "center",
                  },
                ]}
              >
                {cell.label}
              </Text>
            ))}
          </View>
        ) : null}

        {/* Rows */}
        {standings.map((item) => {
          const isOwn = item.isOwnClub;
          const badgeColor = teamColors?.[item.teamApiId] ?? null;
          const onPress = isOwn ? onOwnClubPress : onOpponentPress;
          return (
            <StandingRow
              key={`${item.position}-${String(item.teamApiId)}`}
              item={item}
              isOwn={isOwn}
              badgeColor={badgeColor}
              onPress={onPress}
              layout={layout}
              fontScale={fontScale}
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
  onPress?: (teamApiId: number) => void;
  layout: TableLayout;
  fontScale: number;
}

function StandingRowImpl({ item, isOwn, badgeColor, onPress, layout, fontScale }: StandingRowProps) {
  const { colors, spacing, isDark, fontFamilies } = useTheme();

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

  // Team name color: own = badge color (primary), opponent = neutral
  const teamColor = isOwn
    ? getNativeTeamColor(badgeColor, item.teamName, isDark).name
    : colors.foreground;

  const handlePress = useCallback(() => {
    onPress?.(item.teamApiId);
  }, [onPress, item.teamApiId]);

  const translate = (key: string, options?: Record<string, string | number>) =>
    i18n.t(key, options);
  const a11yLabel = standingA11yLabel(item, item.teamName, translate);
  const cells = standingStatCells(item, translate);

  const valueStyle = (key: StandingStatKey) => ({
    fontSize: 13,
    fontFamily: key === "points" ? fontFamilies.bodySemiBold : fontFamilies.body,
    color: key === "diff" ? diffColor : colors.foreground,
  });

  const position = (
    <Text
      style={{
        minWidth: scaledSize(POSITION_MIN_WIDTH, fontScale),
        textAlign: "center",
        fontSize: 13,
        fontFamily: fontFamilies.body,
        color: colors.mutedForeground,
      }}
    >
      {item.position}
    </Text>
  );

  const team = (
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
        // Stacked rows give the name its own line, so it may wrap there.
        numberOfLines={layout === "columns" ? 1 : undefined}
      >
        {item.teamName}
      </Text>
    </View>
  );

  const rowFrame = {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: rowBg,
    borderLeftWidth: leftBorderWidth,
    borderLeftColor: leftBorderColor,
  };

  const row =
    layout === "columns" ? (
      <View style={[rowFrame, { flexDirection: "row", alignItems: "center" }]}>
        {position}
        {team}
        {cells.map((cell) => (
          <Text
            key={cell.key}
            style={[
              valueStyle(cell.key),
              {
                minWidth: scaledSize(STAT_MIN_WIDTH[cell.key], fontScale),
                textAlign: cell.key === "points" ? "right" : "center",
              },
            ]}
          >
            {cell.value}
          </Text>
        ))}
      </View>
    ) : (
      <View style={rowFrame}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {position}
          {team}
        </View>
        {/* One labelled value per column, wrapping onto as many lines as
            the text size needs. */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            columnGap: spacing.md,
            rowGap: spacing.xs,
            marginTop: spacing.xs,
          }}
        >
          {cells.map((cell) => (
            <Text key={cell.key} style={valueStyle(cell.key)}>
              <Text
                style={{
                  fontFamily: fontFamilies.displayMedium,
                  color: colors.mutedForeground,
                }}
              >
                {`${cell.label} `}
              </Text>
              {cell.value}
            </Text>
          ))}
        </View>
      </View>
    );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        onPress={handlePress}
        style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
      >
        {row}
      </Pressable>
    );
  }

  return (
    <View accessible accessibilityLabel={a11yLabel}>
      {row}
    </View>
  );
}

const StandingRow = memo(StandingRowImpl);
