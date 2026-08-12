import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SheetScreen } from "@/components/sheets/SheetScreen";
import { multilineInput, singleLineInput } from "@/components/ui/inputStyles";
import { useBoard } from "@/hooks/board/useBoard";
import { useBoardMutations } from "@/hooks/board/useBoardMutations";
import { useSeedOnce } from "@/hooks/useSeedOnce";
import { parseNumericParam } from "@/lib/nav/route-params";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

export default function BoardSettingsSheetRoute() {
  const { boardId: boardIdParam } = useLocalSearchParams<{ boardId?: string }>();
  const boardId = parseNumericParam(boardIdParam);
  const { data: board } = useBoard(boardId);
  const mutations = useBoardMutations();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const theme = useTheme();
  const { colors, spacing, radius } = theme;

  // The board comes from the SWR cache the board screen already filled, so in
  // practice this seeds on the first render; the hook covers a cold open.
  useSeedOnce(board, (seed) => {
    setName(seed.name);
    setDescription(seed.description ?? "");
  });

  const canSave = name.trim().length > 0 && !submitting && board != null;

  const save = async () => {
    if (!board || !canSave) return;
    const trimmedName = name.trim();
    const trimmedDescription = description.trim() || null;
    if (trimmedName === board.name && trimmedDescription === (board.description ?? null)) {
      router.back();
      return;
    }
    setSubmitting(true);
    try {
      await mutations.update(board.id, { name: trimmedName, description: trimmedDescription });
      router.back();
    } catch {
      // useBoardMutations already toasted the failure.
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
          onPress: () => {
            void (async () => {
              try {
                await mutations.remove(board.id);
                // One navigation, not two `back()`s: the sheet AND the board
                // screen behind it both have to go, and the board screen has
                // no board left to render.
                router.dismissTo("/admin/boards");
              } catch {
                // useBoardMutations already toasted the failure.
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <SheetScreen layout="scroll" title={i18n.t("admin.boards.settingsTitle")} testID="board-settings-sheet">
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={i18n.t("admin.boards.namePlaceholder")}
        placeholderTextColor={colors.mutedForeground}
        maxLength={120}
        style={singleLineInput(theme, { fontSize: 16, fontWeight: "600" })}
      />

      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder={i18n.t("admin.boards.descriptionPlaceholder")}
        placeholderTextColor={colors.mutedForeground}
        multiline
        maxLength={500}
        style={multilineInput(theme, { fontSize: 14, minHeight: 64 })}
      />

      <Pressable
        onPress={() => {
          void save();
        }}
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

      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.sm }} />

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
    </SheetScreen>
  );
}
