import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Link } from "expo-router";
import type { TaskCardData } from "@dragons/shared";
import { dueDateBucket } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { TASK_ACTIONS, type TaskActionKey } from "@/lib/board/task-actions";
import { taskDetailHref } from "@/lib/nav/board-sheets";
import { Icon } from "@/components/ui/Icon";
import { dueColorFor, formatDueWithBucket } from "./TaskCard";

interface Props {
  task: TaskCardData;
  /** Runs the action the user picked. Ordered `(task, action)` like `onTaskDelete`. */
  onAction: (task: TaskCardData, action: TaskActionKey) => void;
  /** The card itself — whatever the menu is attached to. */
  children: ReactNode;
}

/**
 * A task's actions as the system context menu, opened by holding the card
 * (issue #220, ADR 0002).
 *
 * This replaces two implementations of the same four actions: an
 * `ActionSheetIOS` sheet on iOS and a `@gorhom/bottom-sheet` panel drawn by
 * hand on Android. The menu is expo-router's — `Link.Menu` on a link pointing
 * at the task's own sheet — so it is a real `UIContextMenuInteraction`:
 * UIKit's blur, its lift animation, its haptic, its destructive styling, and a
 * preview of what tapping would open.
 *
 * On Android `Link.Menu` and `Link.Preview` render nothing and the link falls
 * back to its trigger, which is the plainest acceptable fallback per ADR 0001:
 * the card still opens the task, and every action here is also a control on
 * the task sheet (`TaskDetailBody`), so nothing is out of reach.
 *
 * The trigger wrapper is a plain `View`, so the link's own press handler lands
 * on something that ignores it: the card inside keeps its `Pressable`, and the
 * task opens once rather than twice.
 *
 * Not memoised, unlike the card it wraps: `children` is a fresh element on
 * every render of the column, so a shallow prop comparison could never hold.
 * What it wraps is memoised, which is where the render cost was.
 */
export function TaskContextMenu({ task, onAction, children }: Props) {
  return (
    <Link href={taskDetailHref(task.boardId, task.id)} asChild>
      <Link.Trigger>
        <View>{children}</View>
      </Link.Trigger>
      <Link.Preview style={PREVIEW_SIZE}>
        <TaskPreview task={task} />
      </Link.Preview>
      <Link.Menu>
        {TASK_ACTIONS.map((action) => (
          <Link.MenuAction
            key={action.key}
            icon={action.icon}
            destructive={action.destructive}
            onPress={() => onAction(task, action.key)}
          >
            {i18n.t(action.labelKey)}
          </Link.MenuAction>
        ))}
      </Link.Menu>
    </Link>
  );
}

/**
 * The preferred size of the preview, in points.
 *
 * A preview is a fixed box — the system asks for a content size up front — so
 * `TaskPreview` below is built to fill it: a title clamped to two lines over a
 * single meta row. Left unset, the preview takes the whole screen.
 */
const PREVIEW_SIZE = { width: 320, height: 128 } as const;

/**
 * What the preview shows: the task, read-only.
 *
 * Deliberately not `TaskCard` — that one is a pressable with a swipe action, a
 * drag gesture and a drop animation, none of which mean anything inside a
 * preview that cannot be touched.
 */
function TaskPreview({ task }: { task: TaskCardData }) {
  const { colors, spacing } = useTheme();
  const bucket = task.dueDate ? dueDateBucket(task.dueDate, new Date()) : null;
  const dueColor = dueColorFor(bucket, colors);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.card,
        padding: spacing.md,
        gap: spacing.sm,
        justifyContent: "center",
      }}
    >
      <Text
        numberOfLines={2}
        style={{ color: colors.foreground, fontSize: 16, fontWeight: "600", lineHeight: 21 }}
      >
        {task.title}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, fontWeight: "600" }}>
          {i18n.t(`board.priority.${task.priority}`)}
        </Text>
        {task.dueDate ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Icon name="due" size={12} color={dueColor} />
            <Text style={{ color: dueColor, fontSize: 12 }}>
              {formatDueWithBucket(task.dueDate, bucket, i18n.t.bind(i18n))}
            </Text>
          </View>
        ) : null}
        {task.checklistTotal > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Icon name="checklist" size={12} color={colors.mutedForeground} />
            <Text
              style={{
                color: colors.mutedForeground,
                fontSize: 12,
                fontVariant: ["tabular-nums"],
              }}
            >
              {task.checklistChecked}/{task.checklistTotal}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
