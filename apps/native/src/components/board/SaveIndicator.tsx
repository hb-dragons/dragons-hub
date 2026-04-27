import { ActivityIndicator, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useTheme } from "@/hooks/useTheme";

export type SaveState = "idle" | "saving" | "saved";

interface Props {
  state: SaveState;
  /** Optional accessibility label override. */
  label?: string;
}

/**
 * 12px three-state indicator: idle (renders nothing), saving (small spinner),
 * saved (✓ in primary). The parent flips state to "saving" on commit, then
 * to "saved" on resolve, then back to "idle" after ~1s via setTimeout.
 */
export function SaveIndicator({ state, label }: Props) {
  const { colors } = useTheme();

  if (state === "idle") return null;

  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(150)}
      accessibilityLabel={label}
      style={{
        width: 16,
        height: 16,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {state === "saving" ? (
        <ActivityIndicator size="small" color={colors.mutedForeground} />
      ) : (
        <View
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: colors.primary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: colors.primaryForeground, fontSize: 9, fontWeight: "700" }}>
            ✓
          </Text>
        </View>
      )}
    </Animated.View>
  );
}
