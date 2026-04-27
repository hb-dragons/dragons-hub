import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import type { BoardColumnData } from "@dragons/shared";
import { adminBoardApi } from "@/lib/api";
import { useSWRConfig } from "swr";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

interface OpenArgs {
  boardId: number;
  columns: BoardColumnData[];
  initialColumnId: number;
}

export interface QuickCreateSheetHandle {
  open: (args: OpenArgs) => void;
}

export const QuickCreateSheet = forwardRef<QuickCreateSheetHandle>(
  function QuickCreateSheet(_p, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const [args, setArgs] = useState<OpenArgs | null>(null);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [selectedColumnId, setSelectedColumnId] = useState<number | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const snapPoints = useMemo(() => ["40%", "85%"], []);
    const { colors, spacing, radius } = useTheme();
    const { mutate } = useSWRConfig();

    useImperativeHandle(ref, () => ({
      open: (next) => {
        setArgs(next);
        setTitle("");
        setDescription("");
        setSelectedColumnId(next.initialColumnId);
        sheetRef.current?.present();
      },
    }), []);

    const submit = async () => {
      if (!args || selectedColumnId == null) return;
      const trimmedTitle = title.trim();
      if (!trimmedTitle || submitting) return;
      setSubmitting(true);
      try {
        const trimmedDescription = description.trim();
        await adminBoardApi.createTask(args.boardId, {
          columnId: selectedColumnId,
          title: trimmedTitle,
          description: trimmedDescription || undefined,
        });
        await mutate(
          (key) =>
            Array.isArray(key) &&
            key[0] === `admin/boards/${args.boardId}/tasks`,
        );
        sheetRef.current?.dismiss();
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        backgroundStyle={{ backgroundColor: colors.background }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        enablePanDownToClose
        onDismiss={() => setArgs(null)}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
      >
        <BottomSheetScrollView
          testID="quick-create-sheet"
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        >
          <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>
            {i18n.t("board.quickCreate.title")}
          </Text>

          {args?.columns ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing.xs }}
            >
              {args.columns.map((col) => {
                const active = col.id === selectedColumnId;
                return (
                  <Pressable
                    key={col.id}
                    onPress={() => setSelectedColumnId(col.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
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
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          <BottomSheetTextInput
            value={title}
            onChangeText={setTitle}
            placeholder={i18n.t("board.quickCreate.titlePlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
            style={{
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceLow,
              borderWidth: 1,
              borderColor: colors.border,
              color: colors.foreground,
              fontSize: 16,
              fontWeight: "600",
            }}
          />

          <BottomSheetTextInput
            value={description}
            onChangeText={setDescription}
            placeholder={i18n.t("board.quickCreate.descriptionPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            multiline
            style={{
              padding: spacing.md,
              minHeight: 80,
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
            disabled={!title.trim() || submitting || selectedColumnId == null}
            accessibilityRole="button"
            style={{
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor: title.trim() ? colors.primary : colors.surfaceHigh,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: spacing.sm,
            }}
          >
            {submitting ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : null}
            <Text
              style={{
                color: title.trim() ? colors.primaryForeground : colors.mutedForeground,
                fontWeight: "700",
              }}
            >
              {i18n.t("board.quickCreate.submit")}
            </Text>
          </Pressable>
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);
