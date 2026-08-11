import { useLocalSearchParams } from "expo-router";
import { AssigneeSelectSheet } from "@/components/board/AssigneeSelectSheet";
import { useSheetResult } from "@/hooks/useSheetResult";
import { parseIdSet } from "@/lib/nav/route-params";
import { i18n } from "@/lib/i18n";

/** Scope the board to tasks assigned to any of the selected users. */
export default function AssigneeFilterSheetRoute() {
  const { selected, result } = useLocalSearchParams<{ selected?: string; result?: string }>();
  const apply = useSheetResult<Set<string>>(result);

  return (
    <AssigneeSelectSheet
      title={i18n.t("board.filters.assignees")}
      initialSelected={parseIdSet(selected)}
      onApply={apply}
      testID="assignee-filter-sheet"
    />
  );
}
