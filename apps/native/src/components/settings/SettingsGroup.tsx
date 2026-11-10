import { Children, Fragment, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { Icon } from "@/components/ui/Icon";

/**
 * A grouped list in the shape of iOS Settings (#398): a caption above a
 * rounded card of rows, with hairlines between them. Profile is built from
 * these, so its groups read like the system's own settings screens.
 */
export function SettingsGroup({ title, children }: { title?: string; children: ReactNode }) {
  const { colors, radius, spacing, textStyles } = useTheme();
  const rows = Children.toArray(children).filter(Boolean);
  if (rows.length === 0) return null;
  return (
    <View style={{ gap: spacing.xs }}>
      {title ? (
        <Text
          accessibilityRole="header"
          style={[textStyles.caption, { color: colors.mutedForeground, paddingHorizontal: spacing.lg }]}
        >
          {title}
        </Text>
      ) : null}
      <View style={{ backgroundColor: colors.surfaceLowest, borderRadius: radius.md, overflow: "hidden" }}>
        {rows.map((row, index) => (
          <Fragment key={index}>
            {index > 0 ? (
              <View
                style={{
                  height: StyleSheet.hairlineWidth,
                  backgroundColor: colors.border,
                  marginLeft: spacing.lg,
                }}
              />
            ) : null}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

/**
 * One row. `onPress` makes it tappable; `push` adds the disclosure chevron
 * for a row that opens a screen inside the same stack. `value` is the
 * trailing detail text, `accessory` a trailing control (a switch).
 */
export function SettingsRow({
  label,
  value,
  accessory,
  onPress,
  push = false,
  destructive = false,
  role = "button",
}: {
  label: string;
  value?: string;
  accessory?: ReactNode;
  onPress?: () => void;
  push?: boolean;
  destructive?: boolean;
  role?: "button" | "link";
}) {
  const { colors, spacing, textStyles } = useTheme();
  const content = (
    <>
      <Text
        style={[
          textStyles.body,
          { flex: 1, color: destructive ? colors.destructive : colors.foreground },
        ]}
      >
        {label}
      </Text>
      {value ? (
        <Text style={[textStyles.body, { color: colors.mutedForeground }]}>{value}</Text>
      ) : null}
      {accessory}
      {push ? <Icon name="disclosure" size={14} color={colors.mutedForeground} /> : null}
    </>
  );
  const rowStyle = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  };

  if (!onPress) return <View style={rowStyle}>{content}</View>;
  return (
    <Pressable
      accessibilityRole={role}
      onPress={onPress}
      style={({ pressed }) => [rowStyle, pressed && { backgroundColor: colors.surfaceHigh }]}
    >
      {content}
    </Pressable>
  );
}
