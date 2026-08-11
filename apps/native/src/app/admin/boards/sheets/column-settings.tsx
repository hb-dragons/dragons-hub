import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ColumnColorPicker } from "@/components/board/ColumnColorPicker";
import { SheetScreen } from "@/components/sheets/SheetScreen";
import { singleLineInput } from "@/components/ui/inputStyles";
import { useBoard } from "@/hooks/board/useBoard";
import { useColumnMutations } from "@/hooks/board/useColumnMutations";
import { useSeedOnce } from "@/hooks/useSeedOnce";
import { parseNumericParam } from "@/lib/board/sheet-params";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

export default function ColumnSettingsSheetRoute() {
  const params = useLocalSearchParams<{ boardId?: string; columnId?: string }>();
  const boardId = parseNumericParam(params.boardId);
  const columnId = parseNumericParam(params.columnId);
  const { data: board } = useBoard(boardId);
  const column = board?.columns.find((candidate) => candidate.id === columnId) ?? null;
  const mutations = useColumnMutations(boardId ?? 0);

  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [isDoneColumn, setIsDoneColumn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const theme = useTheme();
  const { colors, spacing, radius } = theme;

  useSeedOnce(column, (seed) => {
    setName(seed.name);
    setColor(seed.color ?? null);
    setIsDoneColumn(Boolean(seed.isDoneColumn));
  });

  const canSave = name.trim().length > 0 && !submitting && column != null;

  const save = async () => {
    if (!column || !canSave) return;
    setSubmitting(true);
    try {
      await mutations.update(column.id, { name: name.trim(), color, isDoneColumn });
      router.back();
    } catch {
      // useColumnMutations already toasted the failure.
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = () => {
    if (!column) return;
    Alert.alert(
      i18n.t("board.column.deleteConfirmTitle"),
      i18n.t("board.column.deleteConfirmMessage"),
      [
        { text: i18n.t("common.cancel"), style: "cancel" },
        {
          text: i18n.t("common.delete"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await mutations.remove(column.id);
                router.back();
              } catch {
                // useColumnMutations already toasted the failure.
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <SheetScreen layout="scroll" title={i18n.t("board.column.settingsTitle")} testID="column-settings-sheet">
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={i18n.t("board.column.namePlaceholder")}
        placeholderTextColor={colors.mutedForeground}
        maxLength={64}
        style={singleLineInput(theme, { fontSize: 16, fontWeight: "600" })}
      />

      <ColumnColorPicker value={color} onChange={setColor} />

      <Pressable
        onPress={() => setIsDoneColumn((value) => !value)}
        accessibilityRole="switch"
        accessibilityState={{ checked: isDoneColumn }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: spacing.md,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceLow,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>
          {i18n.t("board.column.markAsDone")}
        </Text>
        <View
          style={{
            width: 44,
            height: 26,
            borderRadius: 13,
            backgroundColor: isDoneColumn ? colors.primary : colors.surfaceHighest,
            padding: 2,
            alignItems: isDoneColumn ? "flex-end" : "flex-start",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: colors.surfaceLowest,
            }}
          />
        </View>
      </Pressable>

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
          opacity: canSave ? 1 : 0.6,
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
          {i18n.t("board.column.delete")}
        </Text>
      </Pressable>
    </SheetScreen>
  );
}
