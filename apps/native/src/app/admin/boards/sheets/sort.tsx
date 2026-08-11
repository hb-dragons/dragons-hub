import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import type { BoardSortMode } from "@dragons/shared";
import { SheetScreen } from "@/components/sheets/SheetScreen";
import { useSheetResult } from "@/hooks/useSheetResult";
import { SORT_MODES, parseSortMode } from "@/lib/board/sheet-params";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

export default function SortSheetRoute() {
  const { current, result } = useLocalSearchParams<{ current?: string; result?: string }>();
  const selected = parseSortMode(current);
  const pick = useSheetResult<BoardSortMode>(result);
  const { colors, spacing, radius } = useTheme();

  return (
    <SheetScreen title={i18n.t("board.sort.title")} testID="sort-sheet">
      <View style={{ gap: spacing.sm }}>
        {SORT_MODES.map((mode) => {
          const isSelected = mode === selected;
          return (
            <Pressable
              key={mode}
              onPress={() => pick(mode)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: spacing.md,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: isSelected ? colors.primary : colors.border,
                backgroundColor: isSelected ? colors.surfaceLow : "transparent",
              }}
            >
              <Text
                style={{
                  color: colors.foreground,
                  fontSize: 15,
                  fontWeight: isSelected ? "700" : "500",
                }}
              >
                {i18n.t(`board.sort.modes.${mode}`)}
              </Text>
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  borderWidth: 2,
                  borderColor: isSelected ? colors.primary : colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {isSelected ? (
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: colors.primary,
                    }}
                  />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </SheetScreen>
  );
}
