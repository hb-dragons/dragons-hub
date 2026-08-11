import { Pressable, Text, View } from "react-native";
import { COLUMN_COLOR_PRESETS } from "@/lib/board/column-colors";
import { useTheme } from "@/hooks/useTheme";

interface Props {
  /** `null` is the "no colour" swatch, drawn as a dash. */
  value: string | null;
  onChange: (next: string | null) => void;
}

/**
 * The column colour swatches, shared by the add-column and column-settings
 * sheets — the two places a column's colour can be set, which must offer the
 * same swatches with the same selected-state affordance.
 */
export function ColumnColorPicker({ value, onChange }: Props) {
  const { colors, spacing } = useTheme();

  return (
    <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
      {COLUMN_COLOR_PRESETS.map((preset, index) => {
        const selected = preset === value;
        return (
          <Pressable
            key={preset ?? `none-${index}`}
            onPress={() => onChange(preset)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            hitSlop={6}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: preset ?? colors.surfaceHigh,
              borderWidth: selected ? 3 : 1,
              borderColor: selected ? colors.primary : colors.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {preset == null ? (
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>—</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
