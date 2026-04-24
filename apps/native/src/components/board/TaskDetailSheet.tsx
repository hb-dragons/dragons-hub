import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useTaskDetail } from "@/hooks/board/useTaskDetail";
import { TaskDetailBody } from "./TaskDetailBody";
import { useTheme } from "@/hooks/useTheme";

export interface TaskDetailSheetHandle {
  open: (taskId: number) => void;
  close: () => void;
}

interface Props {
  boardId: number;
}

export const TaskDetailSheet = forwardRef<TaskDetailSheetHandle, Props>(
  function TaskDetailSheet({ boardId }, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const [taskId, setTaskId] = useState<number | null>(null);
    const { colors } = useTheme();
    const snapPoints = useMemo(() => ["55%", "92%"], []);

    useImperativeHandle(
      ref,
      () => ({
        open: (id) => {
          setTaskId(id);
          sheetRef.current?.present();
        },
        close: () => sheetRef.current?.dismiss(),
      }),
      [],
    );

    const { data: task, isLoading } = useTaskDetail(taskId);

    const renderBackdrop = useCallback(
      (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          pressBehavior="close"
        />
      ),
      [],
    );

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.background }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        onDismiss={() => setTaskId(null)}
        enablePanDownToClose
      >
        <BottomSheetView style={{ flex: 1 }}>
          {isLoading || !task ? (
            <View style={{ padding: 32, alignItems: "center" }}>
              <ActivityIndicator color={colors.foreground} />
            </View>
          ) : (
            <TaskDetailBody task={task} boardId={boardId} />
          )}
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);
