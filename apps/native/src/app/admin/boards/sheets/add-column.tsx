import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ColumnColorPicker } from "@/components/board/ColumnColorPicker";
import { SheetScreen } from "@/components/sheets/SheetScreen";
import { singleLineInput } from "@/components/ui/inputStyles";
import { useColumnMutations } from "@/hooks/board/useColumnMutations";
import { parseNumericParam } from "@/lib/board/sheet-params";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

export default function AddColumnSheetRoute() {
  const { boardId: boardIdParam } = useLocalSearchParams<{ boardId?: string }>();
  const boardId = parseNumericParam(boardIdParam);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const theme = useTheme();
  const { colors, spacing, radius } = theme;

  // Hooks run unconditionally; `add` is only reachable once `boardId` parsed.
  const mutations = useColumnMutations(boardId ?? 0);

  const canSubmit = name.trim().length > 0 && !submitting && boardId != null;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await mutations.add({ name: name.trim(), color });
      router.back();
    } catch {
      // useColumnMutations already surfaced the failure as a toast; keep the
      // sheet open so the typed name is not lost.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SheetScreen title={i18n.t("board.column.addTitle")} testID="add-column-sheet">
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={i18n.t("board.column.namePlaceholder")}
        placeholderTextColor={colors.mutedForeground}
        autoFocus
        maxLength={64}
        returnKeyType="done"
        onSubmitEditing={() => {
          void submit();
        }}
        style={singleLineInput(theme, { fontSize: 16, fontWeight: "600" })}
      />

      <ColumnColorPicker value={color} onChange={setColor} />

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
          {i18n.t("board.column.add")}
        </Text>
      </Pressable>
    </SheetScreen>
  );
}
