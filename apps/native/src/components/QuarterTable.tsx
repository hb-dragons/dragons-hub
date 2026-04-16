import { View, Text } from "react-native";
import type { PublicMatchDetail } from "@dragons/shared";
import { useTheme } from "../hooks/useTheme";
import { i18n } from "../lib/i18n";
import { fontFamilies } from "../theme/typography";

interface QuarterTableProps {
  match: PublicMatchDetail;
  homeLabel: string;
  guestLabel: string;
  homeColor: string;
}

interface Column {
  label: string;
  homeValue: number | null;
  guestValue: number | null;
}

function buildColumns(match: PublicMatchDetail): Column[] {
  const columns: Column[] = [];

  // Determine if achtel (Q5-Q8 present)
  const isAchtel =
    match.homeQ5 !== null ||
    match.homeQ6 !== null ||
    match.homeQ7 !== null ||
    match.homeQ8 !== null;

  // Quarter columns
  const quarterCount = isAchtel ? 8 : 4;
  const homeQuarters = [
    match.homeQ1, match.homeQ2, match.homeQ3, match.homeQ4,
    match.homeQ5, match.homeQ6, match.homeQ7, match.homeQ8,
  ];
  const guestQuarters = [
    match.guestQ1, match.guestQ2, match.guestQ3, match.guestQ4,
    match.guestQ5, match.guestQ6, match.guestQ7, match.guestQ8,
  ];

  for (let i = 0; i < quarterCount; i++) {
    columns.push({
      label: `Q${i + 1}`,
      homeValue: homeQuarters[i] ?? null,
      guestValue: guestQuarters[i] ?? null,
    });
  }

  // OT columns (if present)
  if (match.homeOt1 !== null || match.guestOt1 !== null) {
    columns.push({ label: "OT1", homeValue: match.homeOt1, guestValue: match.guestOt1 });
  }
  if (match.homeOt2 !== null || match.guestOt2 !== null) {
    columns.push({ label: "OT2", homeValue: match.homeOt2, guestValue: match.guestOt2 });
  }

  // Halftime
  if (match.homeHalftimeScore !== null || match.guestHalftimeScore !== null) {
    columns.push({
      label: i18n.t("gameDetail.halftime"),
      homeValue: match.homeHalftimeScore,
      guestValue: match.guestHalftimeScore,
    });
  }

  // Total
  if (match.homeScore !== null || match.guestScore !== null) {
    columns.push({
      label: i18n.t("gameDetail.total"),
      homeValue: match.homeScore,
      guestValue: match.guestScore,
    });
  }

  return columns;
}

function hasQuarterData(match: PublicMatchDetail): boolean {
  return (
    match.homeQ1 !== null ||
    match.guestQ1 !== null ||
    match.homeQ2 !== null ||
    match.guestQ2 !== null
  );
}

export function QuarterTable({ match, homeLabel, guestLabel, homeColor }: QuarterTableProps) {
  const { colors, spacing } = useTheme();

  if (!hasQuarterData(match)) return null;

  const columns = buildColumns(match);
  const colWidth = 36;

  const sectionLabelStyle = {
    fontSize: 11,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    color: colors.mutedForeground,
    fontFamily: fontFamilies.displayMedium,
  };

  const headerCellStyle = {
    fontSize: 11,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    color: colors.mutedForeground,
    fontFamily: fontFamilies.displayMedium,
    width: colWidth,
    textAlign: "center" as const,
  };

  function renderScoreCell(
    value: number | null,
    opponentValue: number | null,
    key: string,
  ) {
    const isWinner = value !== null && opponentValue !== null && value > opponentValue;
    const isLoser = value !== null && opponentValue !== null && value < opponentValue;

    return (
      <Text
        key={key}
        style={{
          width: colWidth,
          textAlign: "center",
          fontSize: 13,
          fontFamily: isWinner ? fontFamilies.bodySemiBold : fontFamilies.body,
          color: isLoser ? colors.mutedForeground : colors.foreground,
        }}
      >
        {value !== null ? value : "—"}
      </Text>
    );
  }

  return (
    <View>
      {/* Section label */}
      <Text style={[sectionLabelStyle, { marginBottom: spacing.sm }]}>
        {i18n.t("gameDetail.quarters")}
      </Text>

      <View
        style={{
          backgroundColor: colors.surfaceLowest,
          borderRadius: 4,
          padding: spacing.lg,
        }}
      >
        {/* Header row */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.sm }}>
          <View style={{ width: 72 }} />
          {columns.map((col) => (
            <Text key={col.label} style={headerCellStyle}>
              {col.label}
            </Text>
          ))}
        </View>

        {/* Home row */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: spacing.xs,
          }}
        >
          <Text
            style={{
              width: 72,
              fontSize: 13,
              fontFamily: fontFamilies.bodySemiBold,
              color: homeColor,
            }}
            numberOfLines={1}
          >
            {homeLabel}
          </Text>
          {columns.map((col) =>
            renderScoreCell(col.homeValue, col.guestValue, `home-${col.label}`),
          )}
        </View>

        {/* Guest row */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: spacing.xs,
          }}
        >
          <Text
            style={{
              width: 72,
              fontSize: 13,
              fontFamily: fontFamilies.body,
              color: colors.mutedForeground,
            }}
            numberOfLines={1}
          >
            {guestLabel}
          </Text>
          {columns.map((col) =>
            renderScoreCell(col.guestValue, col.homeValue, `guest-${col.label}`),
          )}
        </View>
      </View>
    </View>
  );
}
