import { ScrollView, Pressable, Text, View } from "react-native";
import type { BoardColumnData, TaskCardData } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";

interface BoardHeaderProps {
  columns: BoardColumnData[];
  tasks: TaskCardData[];
  activeColumnIndex: number;
  onPillPress: (index: number) => void;
}

const PILL_HEIGHT = 32;

export function BoardHeader({ columns, tasks, activeColumnIndex, onPillPress }: BoardHeaderProps) {
  const { colors, spacing, radius } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={{
        paddingHorizontal: spacing.md,
        paddingTop: spacing.sm,
        paddingBottom: spacing.xs,
        gap: spacing.xs,
        alignItems: "center",
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
              height: PILL_HEIGHT,
              paddingHorizontal: spacing.md,
              borderRadius: radius.pill,
              backgroundColor: active ? colors.primary : "transparent",
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
                opacity: active ? 0.85 : 1,
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
