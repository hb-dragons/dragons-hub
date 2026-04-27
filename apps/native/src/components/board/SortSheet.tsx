import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import type { BoardSortMode } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

const OPTIONS: BoardSortMode[] = [
  "position",
  "due-asc",
  "due-desc",
  "priority-desc",
  "updated-desc",
];

export interface SortSheetHandle {
  open: (current: BoardSortMode, onPick: (next: BoardSortMode) => void) => void;
}

export const SortSheet = forwardRef<SortSheetHandle>(function SortSheet(_p, ref) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const onPickRef = useRef<(next: BoardSortMode) => void>(() => {});
  const [current, setCurrent] = useState<BoardSortMode>("position");
  const snapPoints = useMemo(() => ["48%"], []);
  const { colors, spacing, radius } = useTheme();

  useImperativeHandle(ref, () => ({
    open: (initial, onPick) => {
      setCurrent(initial);
      onPickRef.current = onPick;
      sheetRef.current?.present();
    },
  }), []);

  const pick = (mode: BoardSortMode) => {
    setCurrent(mode);
    onPickRef.current(mode);
    sheetRef.current?.dismiss();
  };

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      backgroundStyle={{ backgroundColor: colors.background }}
      handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
      enablePanDownToClose
    >
      <BottomSheetView style={{ padding: spacing.lg, gap: spacing.sm }}>
        <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>
          {i18n.t("board.sort.title")}
        </Text>
        {OPTIONS.map((mode) => {
          const selected = mode === current;
          return (
            <Pressable
              key={mode}
              onPress={() => pick(mode)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: spacing.md,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: selected ? colors.primary : colors.border,
                backgroundColor: selected ? colors.surfaceLow : "transparent",
              }}
            >
              <Text
                style={{
                  color: colors.foreground,
                  fontSize: 15,
                  fontWeight: selected ? "700" : "500",
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
                  borderColor: selected ? colors.primary : colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {selected ? (
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
      </BottomSheetView>
    </BottomSheetModal>
  );
});
