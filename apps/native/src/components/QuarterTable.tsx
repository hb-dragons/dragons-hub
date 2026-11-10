import { View, Text, useWindowDimensions } from "react-native";
import type { PublicMatchDetail } from "@dragons/shared";
import { useTheme } from "../hooks/useTheme";
import { i18n } from "../lib/i18n";
import { hasQuarterData, quarterColumns } from "../lib/ui/quarter-columns";
import { maxFontSizeMultiplierFor, scaledSize, tableLayoutFor } from "../theme/text-scaling";

interface QuarterTableProps {
  match: PublicMatchDetail;
  homeLabel: string;
  guestLabel: string;
  homeColor: string;
}

/** Minimum widths at the default text size, in points; they grow with the text. */
const TEAM_MIN_WIDTH = 72;
const PERIOD_MIN_WIDTH = 36;

const TABLE_HEADER_CAP = maxFontSizeMultiplierFor("tableHeader");

export function QuarterTable({ match, homeLabel, guestLabel, homeColor }: QuarterTableProps) {
  const { colors, spacing, fontFamilies } = useTheme();
  const { fontScale } = useWindowDimensions();

  if (!hasQuarterData(match)) return null;

  const columns = quarterColumns(match, (key, options) => i18n.t(key, options));
  // Columns: one column per period, teams down the side. Stacked: the table
  // turned on its side, one row per period, so twelve periods at the largest
  // text size still fit a phone's width.
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

  function scoreStyle(value: number | null, opponentValue: number | null) {
    const isWinner = value !== null && opponentValue !== null && value > opponentValue;
    const isLoser = value !== null && opponentValue !== null && value < opponentValue;
    return {
      textAlign: "center" as const,
      fontSize: 13,
      fontFamily: isWinner ? fontFamilies.bodySemiBold : fontFamilies.body,
      color: isLoser ? colors.mutedForeground : colors.foreground,
    };
  }

  const homeLabelStyle = {
    fontSize: 13,
    fontFamily: fontFamilies.bodySemiBold,
    color: homeColor,
  };
  const guestLabelStyle = {
    fontSize: 13,
    fontFamily: fontFamilies.body,
    color: colors.mutedForeground,
  };

  const display = (value: number | null) => (value !== null ? value : "—");

  return (
    <View>
      {/* Section label */}
      <Text
        accessibilityRole="header"
        style={[sectionLabelStyle, { marginBottom: spacing.sm }]}
      >
        {i18n.t("gameDetail.quarters")}
      </Text>

      <View
        style={{
          backgroundColor: colors.surfaceLowest,
          borderRadius: 4,
          padding: spacing.lg,
        }}
      >
        {layout === "columns" ? (
          <>
            {/* Header row */}
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.sm }}>
              <View style={{ minWidth: scaledSize(TEAM_MIN_WIDTH, fontScale) }} />
              {columns.map((col) => (
                <Text
                  key={col.label}
                  maxFontSizeMultiplier={TABLE_HEADER_CAP}
                  style={[headerCellStyle, { minWidth: scaledSize(PERIOD_MIN_WIDTH, fontScale) }]}
                >
                  {col.label}
                </Text>
              ))}
            </View>

            {/* Home and guest rows */}
            {(["home", "guest"] as const).map((side) => (
              <View
                key={side}
                style={{ flexDirection: "row", alignItems: "center", paddingVertical: spacing.xs }}
              >
                <Text
                  style={[
                    side === "home" ? homeLabelStyle : guestLabelStyle,
                    { minWidth: scaledSize(TEAM_MIN_WIDTH, fontScale), maxWidth: scaledSize(TEAM_MIN_WIDTH, fontScale) },
                  ]}
                  numberOfLines={1}
                >
                  {side === "home" ? homeLabel : guestLabel}
                </Text>
                {columns.map((col) => {
                  const own = side === "home" ? col.homeValue : col.guestValue;
                  const other = side === "home" ? col.guestValue : col.homeValue;
                  return (
                    <Text
                      key={`${side}-${col.label}`}
                      style={[scoreStyle(own, other), { minWidth: scaledSize(PERIOD_MIN_WIDTH, fontScale) }]}
                    >
                      {display(own)}
                    </Text>
                  );
                })}
              </View>
            ))}
          </>
        ) : (
          <>
            {/* Header row: the two teams */}
            <View style={{ flexDirection: "row", alignItems: "flex-end", marginBottom: spacing.sm }}>
              <View style={{ minWidth: scaledSize(PERIOD_MIN_WIDTH, fontScale) }} />
              <Text style={[homeLabelStyle, { flex: 1, textAlign: "center" }]}>{homeLabel}</Text>
              <Text style={[guestLabelStyle, { flex: 1, textAlign: "center" }]}>{guestLabel}</Text>
            </View>

            {/* One row per period */}
            {columns.map((col) => (
              <View
                key={col.label}
                style={{ flexDirection: "row", alignItems: "center", paddingVertical: spacing.xs }}
              >
                <Text
                  maxFontSizeMultiplier={TABLE_HEADER_CAP}
                  style={[sectionLabelStyle, { minWidth: scaledSize(PERIOD_MIN_WIDTH, fontScale) }]}
                >
                  {col.label}
                </Text>
                <Text style={[scoreStyle(col.homeValue, col.guestValue), { flex: 1 }]}>
                  {display(col.homeValue)}
                </Text>
                <Text style={[scoreStyle(col.guestValue, col.homeValue), { flex: 1 }]}>
                  {display(col.guestValue)}
                </Text>
              </View>
            ))}
          </>
        )}
      </View>
    </View>
  );
}
