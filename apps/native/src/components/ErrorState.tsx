import { View, Text, Pressable } from "react-native";
import { useTheme } from "@/hooks/useTheme";

interface ErrorStateProps {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}

/**
 * Terminal state for a screen whose data could not be loaded.
 *
 * Screens used to render an indefinite `ActivityIndicator` here, because they
 * branched on `isLoading || !data` and SWR reports `isLoading: false` with
 * `data: undefined` after a failed fetch. Anything that can fail needs a
 * message and a way out.
 */
export function ErrorState({ message, retryLabel, onRetry }: ErrorStateProps) {
  const { colors, textStyles, spacing, radius } = useTheme();

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: spacing.xl,
        paddingTop: spacing["2xl"],
        gap: spacing.md,
      }}
    >
      <Text
        style={[
          textStyles.body,
          { color: colors.mutedForeground, textAlign: "center" },
        ]}
      >
        {message}
      </Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={retryLabel}
        style={{
          backgroundColor: colors.primary,
          borderRadius: radius.md,
          paddingHorizontal: spacing.xl,
          paddingVertical: spacing.md,
        }}
      >
        <Text style={[textStyles.button, { color: colors.primaryForeground }]}>
          {retryLabel}
        </Text>
      </Pressable>
    </View>
  );
}
