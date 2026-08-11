import { useLocalSearchParams } from "expo-router";
import { AssigneeSelectSheet } from "@/components/board/AssigneeSelectSheet";
import { useSheetResult } from "@/hooks/useSheetResult";
import { parseIdSet } from "@/lib/board/sheet-params";
import { i18n } from "@/lib/i18n";

/**
 * Assign users to a task. Selections are batched here and delivered once, on
 * Apply; the opening screen diffs them against what the task had and runs the
 * add/remove mutations. Dismissing without Apply discards the changes.
 */
export default function AssigneePickerSheetRoute() {
  const { selected, result } = useLocalSearchParams<{ selected?: string; result?: string }>();
  const apply = useSheetResult<Set<string>>(result);

  return (
    <AssigneeSelectSheet
      title={i18n.t("board.assignees.title")}
      initialSelected={parseIdSet(selected)}
      onApply={apply}
      testID="assignee-picker-sheet"
    />
  );
}
