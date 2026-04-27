import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text } from "react-native";
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { useBoardMutations } from "@/hooks/board/useBoardMutations";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

export interface CreateBoardSheetHandle {
  open: (onCreated?: (boardId: number) => void) => void;
}

export const CreateBoardSheet = forwardRef<CreateBoardSheetHandle>(
  function CreateBoardSheet(_p, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const onCreatedRef = useRef<((id: number) => void) | undefined>(undefined);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const snapPoints = useMemo(() => ["50%"], []);
    const { colors, spacing, radius } = useTheme();
    const mutations = useBoardMutations();

    useImperativeHandle(ref, () => ({
      open: (onCreated) => {
        setName("");
        setDescription("");
        onCreatedRef.current = onCreated;
        sheetRef.current?.present();
      },
    }), []);

    const submit = async () => {
      const trimmed = name.trim();
      if (!trimmed || submitting) return;
      setSubmitting(true);
      try {
        const created = await mutations.create({
          name: trimmed,
          description: description.trim() || null,
        });
        sheetRef.current?.dismiss();
        onCreatedRef.current?.(created.id);
      } catch {
        // toast already shown
      } finally {
        setSubmitting(false);
      }
    };

    const canSubmit = name.trim().length > 0 && !submitting;

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        backgroundStyle={{ backgroundColor: colors.background }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        enablePanDownToClose
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
      >
        <BottomSheetView style={{ padding: spacing.lg, gap: spacing.md }}>
          <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>
            {i18n.t("admin.boards.new")}
          </Text>

          <BottomSheetTextInput
            value={name}
            onChangeText={setName}
            placeholder={i18n.t("admin.boards.namePlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            autoFocus
            maxLength={120}
            returnKeyType="next"
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
            placeholder={i18n.t("admin.boards.descriptionPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            multiline
            maxLength={500}
            style={{
              padding: spacing.md,
              minHeight: 80,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceLow,
              borderWidth: 1,
              borderColor: colors.border,
              color: colors.foreground,
              fontSize: 14,
              textAlignVertical: "top",
            }}
          />

          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            accessibilityRole="button"
            style={{
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor: canSubmit ? colors.primary : colors.surfaceHigh,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: spacing.sm,
              opacity: canSubmit ? 1 : 0.6,
            }}
          >
            {submitting ? <ActivityIndicator color={colors.primaryForeground} /> : null}
            <Text
              style={{
                color: canSubmit ? colors.primaryForeground : colors.mutedForeground,
                fontWeight: "700",
              }}
            >
              {i18n.t("admin.boards.create")}
            </Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);
