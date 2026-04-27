import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import type { TaskDetail } from "@dragons/shared";
import { useChecklistMutations } from "@/hooks/board/useChecklistMutations";
import { useTheme } from "@/hooks/useTheme";
import { useToast } from "@/hooks/useToast";
import { i18n } from "@/lib/i18n";
import { haptics } from "@/lib/haptics";
import { adminBoardApi } from "@/lib/api";

interface Props {
  task: TaskDetail;
  boardId: number;
}

export function ChecklistSection({ task, boardId }: Props) {
  const { colors, spacing, radius } = useTheme();
  const mutations = useChecklistMutations(boardId);
  const toast = useToast();
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  const checked = task.checklistChecked;
  const total = task.checklistTotal;
  const percent = total === 0 ? 0 : Math.round((checked / total) * 100);

  const submit = async () => {
    const label = draft.trim();
    if (!label || adding) return;
    setAdding(true);
    try {
      await mutations.addItem(task.id, label);
      setDraft("");
    } finally {
      setAdding(false);
    }
  };

  const confirmDelete = (itemId: number) => {
    const item = task.checklist.find((i) => i.id === itemId);
    if (!item) return;
    haptics.warning();
    const snapshot = {
      label: item.label,
      isChecked: item.isChecked,
    };
    void mutations.deleteItem(task.id, itemId).then(() => {
      toast.show({
        title: i18n.t("toast.checklistItemDeleted"),
        action: {
          label: i18n.t("toast.undo"),
          onPress: () => {
            void (async () => {
              try {
                const created = await adminBoardApi.addChecklistItem(
                  task.id,
                  snapshot.label,
                );
                if (snapshot.isChecked) {
                  await adminBoardApi.updateChecklistItem(task.id, created.id, {
                    isChecked: true,
                  });
                }
              } catch {
                toast.show({
                  title: i18n.t("toast.saveFailed"),
                  variant: "error",
                });
              }
            })();
          },
        },
      });
    });
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "700" }}>
          {i18n.t("board.checklist.title")}
        </Text>
        {total > 0 ? (
          <Text
            style={{
              color: colors.mutedForeground,
              fontSize: 12,
              fontVariant: ["tabular-nums"],
            }}
          >
            {checked}/{total}
          </Text>
        ) : null}
      </View>

      {total > 0 ? (
        <View
          style={{
            height: 6,
            borderRadius: radius.pill,
            backgroundColor: colors.surfaceHigh,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              width: `${percent}%`,
              height: "100%",
              backgroundColor: colors.primary,
            }}
          />
        </View>
      ) : null}

      {task.checklist
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((item) => (
          <Pressable
            key={item.id}
            onPress={() => {
              haptics.selection();
              mutations.toggle(task.id, item.id, !item.isChecked);
            }}
            onLongPress={() => confirmDelete(item.id)}
            delayLongPress={500}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: item.isChecked }}
            accessibilityLabel={item.label}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
              paddingVertical: spacing.xs,
            }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                borderWidth: 2,
                borderColor: item.isChecked ? colors.primary : colors.border,
                backgroundColor: item.isChecked ? colors.primary : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {item.isChecked ? (
                <Text style={{ color: colors.primaryForeground, fontSize: 14, fontWeight: "700" }}>
                  ✓
                </Text>
              ) : null}
            </View>
            <Text
              style={{
                flex: 1,
                color: colors.foreground,
                fontSize: 15,
                textDecorationLine: item.isChecked ? "line-through" : "none",
                opacity: item.isChecked ? 0.6 : 1,
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}

      <View
        style={{
          flexDirection: "row",
          gap: spacing.sm,
          alignItems: "center",
        }}
      >
        <BottomSheetTextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submit}
          returnKeyType="done"
          placeholder={i18n.t("board.checklist.addPlaceholder")}
          placeholderTextColor={colors.mutedForeground}
          style={{
            flex: 1,
            padding: spacing.sm,
            borderRadius: radius.md,
            backgroundColor: colors.surfaceLow,
            borderWidth: 1,
            borderColor: colors.border,
            color: colors.foreground,
            fontSize: 14,
          }}
        />
        <Pressable
          onPress={submit}
          disabled={!draft.trim() || adding}
          accessibilityRole="button"
          accessibilityLabel={i18n.t("board.checklist.add")}
          style={{
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderRadius: radius.md,
            backgroundColor:
              draft.trim() && !adding ? colors.primary : colors.surfaceHigh,
          }}
        >
          <Text
            style={{
              color:
                draft.trim() && !adding ? colors.primaryForeground : colors.mutedForeground,
              fontSize: 14,
              fontWeight: "700",
            }}
          >
            +
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
