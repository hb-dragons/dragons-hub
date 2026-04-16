import { View, Text, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";

interface HeaderProps {
  onAvatarPress?: () => void;
}

export function Header({ onAvatarPress }: HeaderProps) {
  const { colors, textStyles, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        paddingTop: insets.top + spacing.sm,
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.md,
        backgroundColor: colors.background,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Text style={[textStyles.sectionTitle, { color: colors.foreground }]}>
        HANOVER DRAGONS
      </Text>

      <Pressable
        onPress={onAvatarPress}
        style={({ pressed }) => ({
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: pressed ? colors.surfaceHighest : colors.surfaceHigh,
          alignItems: "center",
          justifyContent: "center",
        })}
      >
        <Text style={{ fontSize: 14 }}>👤</Text>
      </Pressable>
    </View>
  );
}
