import { Pressable, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";

export function BackButton() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  return (
    <Pressable
      onPress={() => router.back()}
      style={({ pressed }) => [
        styles.button,
        {
          top: insets.top + 4,
          backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)",
          opacity: pressed ? 0.7 : 1,
        },
      ]}
      hitSlop={8}
    >
      <Text style={[styles.chevron, { color: colors.foreground }]}>{"‹"}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    left: 12,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  chevron: {
    fontSize: 24,
    fontWeight: "600",
    marginTop: -2,
    marginLeft: -1,
  },
});
