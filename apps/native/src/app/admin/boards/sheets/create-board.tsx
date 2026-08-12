import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput } from "react-native";
import { router } from "expo-router";
import { SheetScreen } from "@/components/sheets/SheetScreen";
import { multilineInput, singleLineInput } from "@/components/ui/inputStyles";
import { useBoardMutations } from "@/hooks/board/useBoardMutations";
import { buildCreateBoardInput } from "@/lib/board/create-board-input";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

/**
 * Create a board (issue #225).
 *
 * Replaces the app's last `<BottomSheetModal>`, which was mounted next to the
 * board list and opened through an imperative ref — so the list screen had to
 * hold that ref and hand it a callback to run afterwards. As a route it is the
 * same shape as every other sheet under this directory: the presentation is
 * declared once in `lib/nav/sheet-routes.ts` and the system draws the grabber,
 * the detent and the swipe-to-dismiss.
 */
export default function CreateBoardSheetRoute() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const theme = useTheme();
  const { colors, spacing, radius } = theme;
  const mutations = useBoardMutations();

  const body = buildCreateBoardInput({ name, description });
  const canSubmit = body != null && !submitting;

  const submit = async () => {
    if (!body || submitting) return;
    setSubmitting(true);
    try {
      const created = await mutations.create(body);
      // One navigation, not a dismiss followed by a push: the sheet's work is
      // finished and the new board takes its place on the stack, so a back from
      // the board lands on the list it was created from. `create` has already
      // seeded the board's SWR key, so it renders without a fetch.
      router.replace(`/admin/boards/${created.id}`);
    } catch {
      // useBoardMutations already toasted the failure; the sheet stays open so
      // the typed name is not lost.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SheetScreen title={i18n.t("admin.boards.new")} testID="create-board-sheet">
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={i18n.t("admin.boards.namePlaceholder")}
        placeholderTextColor={colors.mutedForeground}
        autoFocus
        // The contract caps a board name at 100 characters
        // (`boardCreateBodySchema`); the JS sheet allowed 120 and let the
        // server reject the difference.
        maxLength={100}
        returnKeyType="next"
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
          void submit();
        }}
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
    </SheetScreen>
  );
}
