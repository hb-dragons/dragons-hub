import { Pressable, Text } from "react-native";
import { useTheme } from "@/hooks/useTheme";

interface FilterPillProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

export function FilterPill({ label, active, onPress }: FilterPillProps) {
  const { colors, radius, textStyles, spacing } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: active ? colors.primary : colors.surfaceHigh,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        marginRight: spacing.sm,
      }}
    >
      <Text
        style={[
          textStyles.label,
          {
            color: active ? colors.primaryForeground : colors.mutedForeground,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
