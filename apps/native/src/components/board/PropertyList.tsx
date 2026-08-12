import { Fragment } from "react";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

interface PropertyRow {
  label: string;
  value: string;
  /** Defaults to the muted colour, i.e. "nothing chosen yet". */
  valueColor?: string;
  onPress: () => void;
}

interface Props {
  rows: PropertyRow[];
}

/**
 * The due / assignees / priority card, as the task-detail and quick-create
 * sheets both draw it (#222).
 *
 * Each row opens one of the picker sheets, so the card is the same control in
 * both places — it was two copies of the same 40 lines until the two sheets
 * became routes and landed next to each other.
 */
export function PropertyList({ rows }: Props) {
  const { colors, spacing, radius } = useTheme();

  return (
    <View
      style={{
        backgroundColor: colors.surfaceLow,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: "hidden",
      }}
    >
      {rows.map((row, index) => (
        <Fragment key={row.label}>
          {index > 0 ? (
            <View
              style={{
                height: 1,
                backgroundColor: colors.border,
                marginHorizontal: spacing.md,
              }}
            />
          ) : null}
          <Pressable
            onPress={row.onPress}
            accessibilityRole="button"
            accessibilityHint={i18n.t("a11y.doubleTapToEdit")}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm + 2,
              backgroundColor: pressed ? colors.surfaceHigh : "transparent",
            })}
          >
            <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>{row.label}</Text>
            <Text
              style={{
                color: row.valueColor ?? colors.mutedForeground,
                fontSize: 14,
                fontWeight: "600",
              }}
            >
              {row.value}
            </Text>
          </Pressable>
        </Fragment>
      ))}
    </View>
  );
}
