import { View, Text } from "react-native";
import { useTheme } from "@/hooks/useTheme";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
}

export function SectionHeader({ title, subtitle }: SectionHeaderProps) {
  const { colors, textStyles, spacing } = useTheme();

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={[textStyles.sectionTitle, { color: colors.foreground }]}>
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={[
            textStyles.caption,
            { color: colors.mutedForeground, marginTop: spacing.xs },
          ]}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
