import { ActivityIndicator, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { SheetScreen } from "@/components/sheets/SheetScreen";
import { TaskDetailBody } from "@/components/board/TaskDetailBody";
import { useTaskDetail } from "@/hooks/board/useTaskDetail";
import { parseNumericParam } from "@/lib/nav/route-params";
import { useTheme } from "@/hooks/useTheme";

/**
 * A task, as a sheet over the board it belongs to (issue #222).
 *
 * The one board sheet that is a whole screen's worth of content: an editable
 * title and description that save on blur, the picker rows, a checklist and a
 * comment thread. It therefore opens at the medium detent — the board stays
 * visible behind it, which is what keeps a task feeling scoped — and grows to
 * large when the user drags it or scrolls to the top of its content.
 *
 * Params are scalars per the convention in `lib/nav/sheet-routes.ts`: the task
 * itself is read from the same SWR key the board screen fills.
 */
export default function TaskDetailSheetRoute() {
  const params = useLocalSearchParams<{ boardId?: string; taskId?: string }>();
  const boardId = parseNumericParam(params.boardId);
  const taskId = parseNumericParam(params.taskId);
  const { data: task } = useTaskDetail(taskId);
  const { colors, spacing } = useTheme();

  return (
    <SheetScreen layout="scroll" testID="task-detail-sheet">
      {task && boardId != null ? (
        <TaskDetailBody task={task} boardId={boardId} />
      ) : (
        <View style={{ paddingVertical: spacing["3xl"], alignItems: "center" }}>
          <ActivityIndicator color={colors.foreground} />
        </View>
      )}
    </SheetScreen>
  );
}
