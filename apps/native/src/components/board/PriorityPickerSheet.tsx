import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import { TASK_PRIORITIES, type TaskPriority } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

export interface PriorityPickerHandle {
  open: (current: TaskPriority, onPick: (p: TaskPriority) => void) => void;
}

export const PriorityPickerSheet = forwardRef<PriorityPickerHandle>(
  function PriorityPickerSheet(_props, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const onPickRef = useRef<(p: TaskPriority) => void>(() => {});
    const currentRef = useRef<TaskPriority>("normal");
    const snapPoints = useMemo(() => ["38%"], []);
    const { colors, spacing, radius } = useTheme();

    useImperativeHandle(
      ref,
      () => ({
        open: (current, onPick) => {
          currentRef.current = current;
          onPickRef.current = onPick;
          sheetRef.current?.present();
        },
      }),
      [],
    );

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        backgroundStyle={{ backgroundColor: colors.background }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        enablePanDownToClose
      >
        <BottomSheetView style={{ padding: spacing.lg, gap: spacing.sm }}>
          {TASK_PRIORITIES.map((p) => {
            const selected = p === currentRef.current;
            return (
              <Pressable
                key={p}
                onPress={() => {
                  onPickRef.current(p);
                  sheetRef.current?.dismiss();
                }}
                accessibilityRole="button"
                accessibilityLabel={i18n.t(`board.priority.${p}`)}
                style={{
                  padding: spacing.md,
                  borderRadius: radius.md,
                  backgroundColor: selected ? colors.primary : colors.surfaceBase,
                  borderWidth: 1,
                  borderColor: selected ? colors.primary : colors.border,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    color: selected ? colors.primaryForeground : colors.foreground,
                    fontSize: 16,
                    fontWeight: "600",
                  }}
                >
                  {i18n.t(`board.priority.${p}`)}
                </Text>
                {selected ? (
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: colors.primaryForeground,
                    }}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);
