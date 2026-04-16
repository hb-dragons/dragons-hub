import type { ReactNode } from "react";
import { View, Pressable, type ViewStyle, type StyleProp } from "react-native";
import { useTheme } from "@/hooks/useTheme";

interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, onPress, style }: CardProps) {
  const { colors, radius, spacing } = useTheme();

  const cardStyle: ViewStyle = {
    backgroundColor: colors.surfaceLowest,
    borderRadius: radius.md,
    padding: spacing.lg,
  };

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          cardStyle,
          pressed && { backgroundColor: colors.surfaceHigh },
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={[cardStyle, style]}>{children}</View>;
}
