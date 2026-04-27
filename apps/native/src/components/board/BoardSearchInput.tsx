import { useEffect, useRef, useState } from "react";
import { Pressable, TextInput, View, Text } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

interface Props {
  /** Current query string. */
  value: string;
  /** Called on every keystroke. */
  onChange: (next: string) => void;
}

function SearchIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={7} stroke={color} strokeWidth={2} />
      <Path d="M20 20l-3.5-3.5" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function BoardSearchInput({ value, onChange }: Props) {
  const { colors, spacing, radius } = useTheme();
  const [expanded, setExpanded] = useState(value.length > 0);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  if (!expanded) {
    return (
      <Pressable
        onPress={() => setExpanded(true)}
        accessibilityRole="button"
        accessibilityLabel={i18n.t("board.search.open")}
        hitSlop={12}
        style={{
          width: 44,
          height: 44,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <SearchIcon size={20} color={colors.foreground} />
      </Pressable>
    );
  }

  // Single dismiss button: clears while typed, collapses when empty.
  const onDismiss = () => {
    if (value.length > 0) {
      onChange("");
    } else {
      setExpanded(false);
    }
  };

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
        paddingHorizontal: spacing.md,
        height: 44,
        borderRadius: radius.pill,
        backgroundColor: colors.surfaceLow,
        borderWidth: 1,
        borderColor: colors.border,
        flex: 1,
      }}
    >
      <SearchIcon size={16} color={colors.mutedForeground} />
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChange}
        placeholder={i18n.t("board.search.placeholder")}
        placeholderTextColor={colors.mutedForeground}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        // No clearButtonMode: avoids the iOS-native ✕ overlapping the manual one.
        // No lineHeight / paddingVertical: the parent View enforces the 44pt
        // height and TextInput centers its single line vertically. Setting
        // lineHeight here would shift the placeholder and typed text down on
        // iOS (a long-standing RN quirk).
        style={{
          flex: 1,
          color: colors.foreground,
          fontSize: 15,
        }}
      />
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel={
          value.length > 0
            ? i18n.t("common.clear")
            : i18n.t("board.search.close")
        }
        hitSlop={12}
        style={{
          width: 28,
          height: 28,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: colors.mutedForeground, fontSize: 16, fontWeight: "700" }}>×</Text>
      </Pressable>
    </View>
  );
}
