import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { BottomSheetModal, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import type { BoardColumnData, TaskCardData } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

interface OpenArgs {
  task: TaskCardData;
  columns: BoardColumnData[];
  countsByColumn: Map<number, number>;
  onMove: (columnId: number, position: number) => Promise<void> | void;
}

export interface MoveToSheetHandle {
  open: (args: OpenArgs) => void;
}

export const MoveToSheet = forwardRef<MoveToSheetHandle>(function MoveToSheet(_p, ref) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const [args, setArgs] = useState<OpenArgs | null>(null);
  const [placement, setPlacement] = useState<"top" | "bottom">("top");
  const [selectedColumnId, setSelectedColumnId] = useState<number | null>(null);
  const snapPoints = useMemo(() => ["65%"], []);
  const { colors, spacing, radius } = useTheme();

  useImperativeHandle(ref, () => ({
    open: (nextArgs) => {
      setArgs(nextArgs);
      setPlacement("top");
      setSelectedColumnId(nextArgs.task.columnId);
      sheetRef.current?.present();
    },
  }), []);

  const confirm = async () => {
    if (!args || selectedColumnId == null) return;
    const count = args.countsByColumn.get(selectedColumnId) ?? 0;
    // If moving within its own column, exclude the task itself from the count
    // for "bottom" placement — otherwise we'd try to insert past the end.
    const ownColumn = selectedColumnId === args.task.columnId;
    const maxPos = ownColumn ? count - 1 : count;
    const position = placement === "top" ? 0 : Math.max(0, maxPos);
    await args.onMove(selectedColumnId, position);
    sheetRef.current?.dismiss();
  };

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      backgroundStyle={{ backgroundColor: colors.background }}
      handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
      enablePanDownToClose
      onDismiss={() => setArgs(null)}
    >
      <BottomSheetScrollView testID="move-to-sheet" contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>
          {i18n.t("board.moveTo.title")}
        </Text>

        {args?.columns.map((col) => {
          const selected = col.id === selectedColumnId;
          const count = args.countsByColumn.get(col.id) ?? 0;
          return (
            <Pressable
              key={col.id}
              onPress={() => setSelectedColumnId(col.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: spacing.md,
                borderRadius: radius.md,
                backgroundColor: selected ? colors.primary : colors.surfaceBase,
                borderWidth: 1,
                borderColor: selected ? colors.primary : colors.border,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 }}>
                {col.color ? (
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: col.color }} />
                ) : null}
                <Text
                  style={{
                    color: selected ? colors.primaryForeground : colors.foreground,
                    fontSize: 15,
                    fontWeight: "600",
                  }}
                >
                  {col.name}
                </Text>
              </View>
              <Text
                style={{
                  color: selected ? colors.primaryForeground : colors.mutedForeground,
                  fontSize: 13,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {count}
              </Text>
            </Pressable>
          );
        })}

        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
          {(["top", "bottom"] as const).map((p) => {
            const active = placement === p;
            return (
              <Pressable
                key={p}
                onPress={() => setPlacement(p)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={{
                  flex: 1,
                  padding: spacing.md,
                  borderRadius: radius.md,
                  backgroundColor: active ? colors.primary : colors.surfaceBase,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: active ? colors.primaryForeground : colors.foreground,
                    fontWeight: "600",
                  }}
                >
                  {i18n.t(`board.moveTo.${p}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={confirm}
          disabled={selectedColumnId == null}
          accessibilityRole="button"
          style={{
            padding: spacing.md,
            borderRadius: radius.md,
            backgroundColor: colors.primary,
            alignItems: "center",
            marginTop: spacing.sm,
          }}
        >
          <Text style={{ color: colors.primaryForeground, fontWeight: "700", fontSize: 15 }}>
            {i18n.t("board.moveTo.confirm")}
          </Text>
        </Pressable>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});
