import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import {
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { router } from "expo-router";
import type { BoardData } from "@dragons/shared";
import { useBoardMutations } from "@/hooks/board/useBoardMutations";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { multilineInput, singleLineInput } from "@/components/ui/inputStyles";

interface OpenArgs {
  board: BoardData;
}

export interface BoardSettingsSheetHandle {
  open: (args: OpenArgs) => void;
}

export const BoardSettingsSheet = forwardRef<BoardSettingsSheetHandle>(
  function BoardSettingsSheet(_p, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const [board, setBoard] = useState<BoardData | null>(null);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const snapPoints = useMemo(() => ["88%"], []);
    const theme = useTheme();
    const { colors, spacing, radius } = theme;
    const mutations = useBoardMutations();

    useImperativeHandle(ref, () => ({
      open: ({ board: b }) => {
        setBoard(b);
        setName(b.name);
        setDescription(b.description ?? "");
        sheetRef.current?.present();
      },
    }), []);

    const saveRename = async () => {
      if (!board) return;
      const trimmedName = name.trim();
      const trimmedDesc = description.trim() || null;
      if (!trimmedName) return;
      if (trimmedName === board.name && trimmedDesc === (board.description ?? null)) {
        sheetRef.current?.dismiss();
        return;
      }
      setSubmitting(true);
      try {
        await mutations.update(board.id, {
          name: trimmedName,
          description: trimmedDesc,
        });
        sheetRef.current?.dismiss();
      } catch {
        // toast already shown
      } finally {
        setSubmitting(false);
      }
    };

    const confirmDelete = () => {
      if (!board) return;
      Alert.alert(
        i18n.t("admin.boards.deleteConfirmTitle"),
        i18n.t("admin.boards.deleteConfirmMessage"),
        [
          { text: i18n.t("common.cancel"), style: "cancel" },
          {
            text: i18n.t("common.delete"),
            style: "destructive",
            onPress: async () => {
              try {
                await mutations.remove(board.id);
                sheetRef.current?.dismiss();
                router.back();
              } catch {
                // toast already shown
              }
            },
          },
        ],
      );
    };

    const canSave = name.trim().length > 0 && !submitting;

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        backgroundStyle={{ backgroundColor: colors.background }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        enablePanDownToClose
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        onDismiss={() => setBoard(null)}
      >
        <BottomSheetView style={{ padding: spacing.lg, gap: spacing.md }}>
          <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>
            {i18n.t("admin.boards.settingsTitle")}
          </Text>

          <BottomSheetTextInput
            value={name}
            onChangeText={setName}
            placeholder={i18n.t("admin.boards.namePlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            maxLength={120}
            style={singleLineInput(theme, { fontSize: 16, fontWeight: "600" })}
          />

          <BottomSheetTextInput
            value={description}
            onChangeText={setDescription}
            placeholder={i18n.t("admin.boards.descriptionPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            multiline
            maxLength={500}
            style={multilineInput(theme, { fontSize: 14, minHeight: 64 })}
          />

          <Pressable
            onPress={saveRename}
            disabled={!canSave}
            accessibilityRole="button"
            style={{
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor: canSave ? colors.primary : colors.surfaceHigh,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: spacing.sm,
            }}
          >
            {submitting ? <ActivityIndicator color={colors.primaryForeground} /> : null}
            <Text
              style={{
                color: canSave ? colors.primaryForeground : colors.mutedForeground,
                fontWeight: "700",
              }}
            >
              {i18n.t("common.save")}
            </Text>
          </Pressable>

          <View
            style={{
              height: 1,
              backgroundColor: colors.border,
              marginVertical: spacing.sm,
            }}
          />

          <Pressable
            onPress={confirmDelete}
            accessibilityRole="button"
            style={{
              padding: spacing.md,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.destructive,
              alignItems: "center",
            }}
          >
            <Text style={{ color: colors.destructive, fontWeight: "700" }}>
              {i18n.t("admin.boards.delete")}
            </Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);
