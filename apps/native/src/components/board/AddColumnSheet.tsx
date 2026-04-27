import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import {
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useColumnMutations } from "@/hooks/board/useColumnMutations";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { singleLineInput } from "@/components/ui/inputStyles";

const COLOR_PRESETS = [
  null,
  "#9ca3af",
  "#34d399",
  "#60a5fa",
  "#f59e0b",
  "#ef4444",
  "#a78bfa",
  "#f472b6",
] as const;

interface OpenArgs {
  boardId: number;
}

export interface AddColumnSheetHandle {
  open: (args: OpenArgs) => void;
}

export const AddColumnSheet = forwardRef<AddColumnSheetHandle>(function AddColumnSheet(_p, ref) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const [args, setArgs] = useState<OpenArgs | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const snapPoints = useMemo(() => ["92%"], []);
  const theme = useTheme();
  const { colors, spacing, radius } = theme;

  // Hooks must be called unconditionally; pass 0 when no board is selected.
  // The hook returns no-op-ish behaviour because mutations are only invoked
  // on submit, which is gated on `args` being non-null.
  const mutations = useColumnMutations(args?.boardId ?? 0);

  useImperativeHandle(ref, () => ({
    open: (next) => {
      setArgs(next);
      setName("");
      setColor(null);
      sheetRef.current?.present();
    },
  }), []);

  const submit = async () => {
    if (!args) return;
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await mutations.add({ name: trimmed, color });
      sheetRef.current?.dismiss();
    } catch {
      // toast handled in hook
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = name.trim().length > 0 && !submitting;

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
      onDismiss={() => setArgs(null)}
    >
      <BottomSheetView style={{ padding: spacing.lg, gap: spacing.md }}>
        <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>
          {i18n.t("board.column.addTitle")}
        </Text>

        <BottomSheetTextInput
          value={name}
          onChangeText={setName}
          placeholder={i18n.t("board.column.namePlaceholder")}
          placeholderTextColor={colors.mutedForeground}
          autoFocus
          maxLength={64}
          returnKeyType="done"
          onSubmitEditing={submit}
          style={singleLineInput(theme, { fontSize: 16, fontWeight: "600" })}
        />

        <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
          {COLOR_PRESETS.map((c, i) => {
            const selected = c === color;
            return (
              <Pressable
                key={c ?? `none-${i}`}
                onPress={() => setColor(c)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                hitSlop={6}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: c ?? colors.surfaceHigh,
                  borderWidth: selected ? 3 : 1,
                  borderColor: selected ? colors.primary : colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {c == null ? (
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>—</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>

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
            {i18n.t("board.column.add")}
          </Text>
        </Pressable>
      </BottomSheetView>
    </BottomSheetModal>
  );
});
