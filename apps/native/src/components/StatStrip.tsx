import { View, Text } from "react-native";
import { useTheme } from "@/hooks/useTheme";

interface StatItem {
  label: string;
  value: string;
}

interface StatStripProps {
  items: StatItem[];
}

export function StatStrip({ items }: StatStripProps) {
  const { colors, radius, textStyles, spacing } = useTheme();

  // border color at 15% opacity
  const dividerColor = colors.border + "26";

  return (
    <View
      style={{
        backgroundColor: colors.surfaceLow,
        borderRadius: radius.md,
        padding: spacing.lg,
        flexDirection: "row",
      }}
    >
      {items.map((item, index) => (
        <View
          key={item.label}
          style={[
            {
              flex: 1,
              alignItems: "center",
            },
            index > 0 && {
              borderLeftWidth: 1,
              borderLeftColor: dividerColor,
            },
          ]}
        >
          <Text style={[textStyles.stat, { color: colors.foreground }]}>
            {item.value}
          </Text>
          <Text
            style={[
              textStyles.caption,
              { color: colors.mutedForeground, marginTop: spacing.xs },
            ]}
          >
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
