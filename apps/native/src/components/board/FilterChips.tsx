import { ScrollView, Pressable, Text, View } from "react-native";
import type { TaskPriority } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { filterPillA11y } from "@/lib/ui/a11y";

export interface BoardFilters {
  mine: boolean;
  priority: TaskPriority | null;
  dueSoon: boolean;
  unassigned: boolean;
  /** User IDs to include. Empty set = no assignee filter applied. */
  assigneeIds: Set<string>;
}

interface Props {
  filters: BoardFilters;
  onToggleMine: () => void;
  onPressPriority: () => void;
  onClearPriority?: () => void;
  onToggleDueSoon: () => void;
  onToggleUnassigned: () => void;
  onPressAssignees: () => void;
  onClearAssignees?: () => void;
}

const CHIP_HEIGHT = 44;

export function FilterChips({
  filters,
  onToggleMine,
  onPressPriority,
  onClearPriority,
  onToggleDueSoon,
  onToggleUnassigned,
  onPressAssignees,
  onClearAssignees,
}: Props) {
  const { colors, spacing, radius } = useTheme();

  const chipStyle = (active: boolean) => ({
    height: CHIP_HEIGHT,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: active ? colors.secondary : "transparent",
    borderWidth: 1,
    borderColor: active ? colors.secondary : colors.border,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.xs,
  });

  const textStyle = (active: boolean) => ({
    color: active ? colors.secondaryForeground : colors.mutedForeground,
    fontSize: 13,
    fontWeight: "500" as const,
  });

  const assigneeCount = filters.assigneeIds.size;
  const assigneeActive = assigneeCount > 0;

  return (
    <ScrollView
      testID="filter-chips"
      horizontal
      showsHorizontalScrollIndicator={true}
      persistentScrollbar={true}
      style={{ flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={{
        paddingHorizontal: spacing.md,
        paddingBottom: spacing.md,
        gap: spacing.xs,
        alignItems: "center",
      }}
    >
      <Pressable
        {...filterPillA11y(i18n.t("board.filters.mine"), filters.mine)}
        onPress={onToggleMine}
        style={chipStyle(filters.mine)}
      >
        <Text style={textStyle(filters.mine)}>{i18n.t("board.filters.mine")}</Text>
      </Pressable>

      <Pressable
        {...filterPillA11y(i18n.t("board.filters.assignees"), assigneeActive)}
        onPress={onPressAssignees}
        style={chipStyle(assigneeActive)}
      >
        <Text style={textStyle(assigneeActive)}>{i18n.t("board.filters.assignees")}</Text>
        {assigneeActive ? (
          <View
            style={{
              minWidth: 20,
              height: 20,
              paddingHorizontal: 6,
              borderRadius: 10,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: colors.primaryForeground,
                fontSize: 11,
                fontWeight: "700",
                fontVariant: ["tabular-nums"],
              }}
            >
              {assigneeCount}
            </Text>
          </View>
        ) : null}
        {assigneeActive && onClearAssignees ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onClearAssignees();
            }}
            accessibilityRole="button"
            accessibilityLabel={i18n.t("common.clear")}
            hitSlop={16}
            style={{
              marginLeft: 4,
              width: 18,
              height: 18,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ ...textStyle(true), fontSize: 16, lineHeight: 16 }}>×</Text>
          </Pressable>
        ) : null}
      </Pressable>

      <Pressable
        {...filterPillA11y(i18n.t("board.filters.priority"), filters.priority != null)}
        onPress={onPressPriority}
        style={chipStyle(filters.priority != null)}
      >
        <Text style={textStyle(filters.priority != null)}>
          {filters.priority
            ? i18n.t(`board.priority.${filters.priority}`)
            : i18n.t("board.filters.priority")}
        </Text>
        {filters.priority != null && onClearPriority ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onClearPriority();
            }}
            accessibilityRole="button"
            accessibilityLabel={i18n.t("common.clear")}
            hitSlop={16}
            style={{
              marginLeft: 4,
              width: 18,
              height: 18,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ ...textStyle(true), fontSize: 16, lineHeight: 16 }}>×</Text>
          </Pressable>
        ) : null}
      </Pressable>

      <Pressable
        {...filterPillA11y(i18n.t("board.filters.dueSoon"), filters.dueSoon)}
        onPress={onToggleDueSoon}
        style={chipStyle(filters.dueSoon)}
      >
        <Text style={textStyle(filters.dueSoon)}>{i18n.t("board.filters.dueSoon")}</Text>
      </Pressable>

      <Pressable
        {...filterPillA11y(i18n.t("board.filters.unassigned"), filters.unassigned)}
        onPress={onToggleUnassigned}
        style={chipStyle(filters.unassigned)}
      >
        <Text style={textStyle(filters.unassigned)}>{i18n.t("board.filters.unassigned")}</Text>
      </Pressable>
    </ScrollView>
  );
}
