import { View, Text } from "react-native";
import { useTheme } from "@/hooks/useTheme";

type BadgeVariant = "default" | "secondary" | "heat" | "destructive";

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

export function Badge({ label, variant = "default" }: BadgeProps) {
  const { colors, radius, textStyles, spacing } = useTheme();

  const variantColors: Record<BadgeVariant, { bg: string; fg: string }> = {
    default: { bg: colors.primary, fg: colors.primaryForeground },
    secondary: { bg: colors.secondary, fg: colors.secondaryForeground },
    heat: { bg: colors.heat, fg: colors.heatForeground },
    destructive: { bg: colors.destructive, fg: colors.destructiveForeground },
  };

  const { bg, fg } = variantColors[variant];

  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        alignSelf: "flex-start",
      }}
    >
      <Text style={[textStyles.label, { color: fg }]}>{label}</Text>
    </View>
  );
}
