import { ScrollView, Pressable, Text } from "react-native";
import type { TaskPriority } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

export interface BoardFilters {
  mine: boolean;
  priority: TaskPriority | null;
  dueSoon: boolean;
  unassigned: boolean;
}

interface Props {
  filters: BoardFilters;
  onToggleMine: () => void;
  onPressPriority: () => void;
  onToggleDueSoon: () => void;
  onToggleUnassigned: () => void;
}

export function FilterChips({
  filters,
  onToggleMine,
  onPressPriority,
  onToggleDueSoon,
  onToggleUnassigned,
}: Props) {
  const { colors, spacing, radius } = useTheme();

  const chipStyle = (active: boolean) => ({
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: active ? colors.primary : colors.surfaceBase,
    borderWidth: 1,
    borderColor: active ? colors.primary : colors.border,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.xs,
  });

  const textStyle = (active: boolean) => ({
    color: active ? colors.primaryForeground : colors.foreground,
    fontSize: 13,
    fontWeight: "600" as const,
  });

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: spacing.md,
        paddingBottom: spacing.sm,
        gap: spacing.xs,
      }}
    >
      <Pressable
        onPress={onToggleMine}
        accessibilityRole="button"
        accessibilityLabel={i18n.t("board.filters.mine")}
        style={chipStyle(filters.mine)}
      >
        <Text style={textStyle(filters.mine)}>{i18n.t("board.filters.mine")}</Text>
      </Pressable>

      <Pressable
        onPress={onPressPriority}
        accessibilityRole="button"
        accessibilityLabel={i18n.t("board.filters.priority")}
        style={chipStyle(filters.priority != null)}
      >
        <Text style={textStyle(filters.priority != null)}>
          {filters.priority
            ? i18n.t(`board.priority.${filters.priority}`)
            : i18n.t("board.filters.priority")}
        </Text>
      </Pressable>

      <Pressable
        onPress={onToggleDueSoon}
        accessibilityRole="button"
        accessibilityLabel={i18n.t("board.filters.dueSoon")}
        style={chipStyle(filters.dueSoon)}
      >
        <Text style={textStyle(filters.dueSoon)}>{i18n.t("board.filters.dueSoon")}</Text>
      </Pressable>

      <Pressable
        onPress={onToggleUnassigned}
        accessibilityRole="button"
        accessibilityLabel={i18n.t("board.filters.unassigned")}
        style={chipStyle(filters.unassigned)}
      >
        <Text style={textStyle(filters.unassigned)}>{i18n.t("board.filters.unassigned")}</Text>
      </Pressable>
    </ScrollView>
  );
}
