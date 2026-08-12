import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { TASK_PRIORITIES, type TaskPriority } from "@dragons/shared";
import { SheetScreen } from "@/components/sheets/SheetScreen";
import { priorityStripeColor } from "@/components/board/TaskCard";
import { useSheetResult } from "@/hooks/useSheetResult";
import { parsePriority } from "@/lib/nav/route-params";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

export default function PriorityPickerSheetRoute() {
  const { current, result } = useLocalSearchParams<{ current?: string; result?: string }>();
  const selected = parsePriority(current);
  const pick = useSheetResult<TaskPriority>(result);
  const { colors, spacing, radius } = useTheme();

  return (
    <SheetScreen title={i18n.t("board.task.priority")} testID="priority-picker-sheet">
      <View style={{ gap: spacing.sm }}>
        {TASK_PRIORITIES.map((priority) => {
          const isSelected = priority === selected;
          const stripe = priorityStripeColor(priority, colors);
          return (
            <Pressable
              key={priority}
              onPress={() => pick(priority)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={i18n.t(`board.priority.${priority}`)}
              style={{
                padding: spacing.md,
                borderRadius: radius.md,
                backgroundColor: isSelected ? colors.primary : colors.surfaceBase,
                borderWidth: 1,
                borderColor: isSelected ? colors.primary : colors.border,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: spacing.sm,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor:
                      stripe === "transparent"
                        ? isSelected
                          ? colors.primaryForeground
                          : colors.border
                        : stripe,
                  }}
                />
                <Text
                  style={{
                    color: isSelected ? colors.primaryForeground : colors.foreground,
                    fontSize: 16,
                    fontWeight: "600",
                  }}
                >
                  {i18n.t(`board.priority.${priority}`)}
                </Text>
              </View>
              {isSelected ? (
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
      </View>
    </SheetScreen>
  );
}
