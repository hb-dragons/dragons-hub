import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Pressable, Text } from "react-native";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import type { TaskCardData } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

export type TaskContextAction = "move" | "priority" | "due" | "delete";

interface OpenArgs {
  task: TaskCardData;
  onAction: (action: TaskContextAction) => void;
}

export interface TaskContextMenuHandle {
  open: (args: OpenArgs) => void;
}

export const TaskContextMenu = forwardRef<TaskContextMenuHandle>(
  function TaskContextMenu(_p, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const [args, setArgs] = useState<OpenArgs | null>(null);
    const snapPoints = useMemo(() => ["38%"], []);
    const { colors, spacing, radius } = useTheme();

    useImperativeHandle(ref, () => ({
      open: (next) => {
        setArgs(next);
        sheetRef.current?.present();
      },
    }), []);

    const items: Array<{ key: TaskContextAction; label: string; destructive?: boolean }> = [
      { key: "move", label: i18n.t("board.task.actions.moveTo") },
      { key: "priority", label: i18n.t("board.task.actions.setPriority") },
      { key: "due", label: i18n.t("board.task.actions.setDue") },
      { key: "delete", label: i18n.t("board.task.actions.delete"), destructive: true },
    ];

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        backgroundStyle={{ backgroundColor: colors.background }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        enablePanDownToClose
        onDismiss={() => setArgs(null)}
      >
        <BottomSheetView style={{ padding: spacing.lg, gap: spacing.xs }}>
          {args?.task ? (
            <Text
              numberOfLines={1}
              style={{ color: colors.mutedForeground, fontSize: 13, marginBottom: spacing.sm }}
            >
              {args.task.title}
            </Text>
          ) : null}
          {items.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => {
                sheetRef.current?.dismiss();
                // Defer action so the sheet finishes dismissing before the next
                // bottom sheet (e.g. MoveToSheet) tries to present.
                setTimeout(() => {
                  args?.onAction(item.key);
                }, 150);
              }}
              accessibilityRole="button"
              style={{
                padding: spacing.md,
                borderRadius: radius.md,
                backgroundColor: colors.surfaceBase,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text
                style={{
                  color: item.destructive ? colors.destructive : colors.foreground,
                  fontSize: 15,
                  fontWeight: "600",
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);
