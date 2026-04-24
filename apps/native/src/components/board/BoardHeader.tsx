import { ScrollView, Pressable, Text, View } from "react-native";
import type { BoardColumnData, TaskCardData } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";

interface BoardHeaderProps {
  columns: BoardColumnData[];
  tasks: TaskCardData[];
  activeColumnIndex: number;
  onPillPress: (index: number) => void;
}

export function BoardHeader({ columns, tasks, activeColumnIndex, onPillPress }: BoardHeaderProps) {
  const { colors, spacing, radius } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        gap: spacing.xs,
      }}
    >
      {columns.map((col, i) => {
        const active = i === activeColumnIndex;
        const count = tasks.filter((t) => t.columnId === col.id).length;
        return (
          <Pressable
            key={col.id}
            onPress={() => onPillPress(i)}
            accessibilityRole="button"
            accessibilityLabel={col.name}
            style={{
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs,
              borderRadius: radius.pill,
              backgroundColor: active ? colors.primary : colors.surfaceBase,
              borderWidth: 1,
              borderColor: active ? colors.primary : colors.border,
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.xs,
            }}
          >
            {col.color ? (
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: col.color,
                }}
              />
            ) : null}
            <Text
              style={{
                color: active ? colors.primaryForeground : colors.foreground,
                fontSize: 13,
                fontWeight: "600",
              }}
            >
              {col.name}
            </Text>
            <Text
              style={{
                color: active ? colors.primaryForeground : colors.mutedForeground,
                fontSize: 12,
                fontVariant: ["tabular-nums"],
              }}
            >
              {count}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
