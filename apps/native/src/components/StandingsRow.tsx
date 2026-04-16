import { View, Text } from "react-native";
import type { StandingItem } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/typography";

interface StandingsRowProps {
  item: StandingItem;
  isOwnClub: boolean;
}

export function StandingsRow({ item, isOwnClub }: StandingsRowProps) {
  const { colors, textStyles, spacing } = useTheme();

  // Own-club: primary at 5% opacity background
  const rowBg = isOwnClub ? colors.primary + "0D" : "transparent";
  // Own-club: 2px left border at 50% opacity
  const leftBorderColor = colors.primary + "80";

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        backgroundColor: rowBg,
        borderLeftWidth: isOwnClub ? 2 : 0,
        borderLeftColor: isOwnClub ? leftBorderColor : "transparent",
      }}
    >
      {/* Position */}
      <Text
        style={[
          textStyles.body,
          { color: colors.mutedForeground, width: 32, textAlign: "center" },
        ]}
      >
        {item.position}
      </Text>

      {/* Team name */}
      <Text
        style={[
          textStyles.body,
          {
            flex: 1,
            color: isOwnClub ? colors.primary : colors.foreground,
            fontFamily: isOwnClub ? fontFamilies.bodySemiBold : fontFamilies.body,
            marginLeft: spacing.sm,
          },
        ]}
        numberOfLines={1}
      >
        {item.teamNameShort || item.teamName}
      </Text>

      {/* Won */}
      <Text
        style={[
          textStyles.body,
          { color: colors.foreground, width: 32, textAlign: "center" },
        ]}
      >
        {item.won}
      </Text>

      {/* Lost */}
      <Text
        style={[
          textStyles.body,
          { color: colors.foreground, width: 32, textAlign: "center" },
        ]}
      >
        {item.lost}
      </Text>

      {/* Points */}
      <Text
        style={[
          textStyles.body,
          {
            color: colors.foreground,
            width: 40,
            textAlign: "center",
            fontFamily: fontFamilies.bodySemiBold,
          },
        ]}
      >
        {item.leaguePoints}
      </Text>
    </View>
  );
}
