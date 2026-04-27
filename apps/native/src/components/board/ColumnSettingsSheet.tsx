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
import type { BoardColumnData } from "@dragons/shared";
import { useColumnMutations } from "@/hooks/board/useColumnMutations";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

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
  column: BoardColumnData;
}

export interface ColumnSettingsSheetHandle {
  open: (args: OpenArgs) => void;
}

export const ColumnSettingsSheet = forwardRef<ColumnSettingsSheetHandle>(
  function ColumnSettingsSheet(_p, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const [args, setArgs] = useState<OpenArgs | null>(null);
    const [name, setName] = useState("");
    const [color, setColor] = useState<string | null>(null);
    const [isDoneColumn, setIsDoneColumn] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const snapPoints = useMemo(() => ["65%"], []);
    const { colors, spacing, radius } = useTheme();

    const mutations = useColumnMutations(args?.boardId ?? 0);

    useImperativeHandle(ref, () => ({
      open: (next) => {
        setArgs(next);
        setName(next.column.name);
        setColor(next.column.color ?? null);
        setIsDoneColumn(Boolean(next.column.isDoneColumn));
        sheetRef.current?.present();
      },
    }), []);

    const save = async () => {
      if (!args) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      setSubmitting(true);
      try {
        await mutations.update(args.column.id, {
          name: trimmed,
          color,
          isDoneColumn,
        });
        sheetRef.current?.dismiss();
      } catch {
        // toast handled
      } finally {
        setSubmitting(false);
      }
    };

    const confirmDelete = () => {
      if (!args) return;
      Alert.alert(
        i18n.t("board.column.deleteConfirmTitle"),
        i18n.t("board.column.deleteConfirmMessage"),
        [
          { text: i18n.t("common.cancel"), style: "cancel" },
          {
            text: i18n.t("common.delete"),
            style: "destructive",
            onPress: async () => {
              try {
                await mutations.remove(args.column.id);
                sheetRef.current?.dismiss();
              } catch {
                // toast handled
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
        backgroundStyle={{ backgroundColor: colors.background }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        enablePanDownToClose
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        onDismiss={() => setArgs(null)}
      >
        <BottomSheetView style={{ padding: spacing.lg, gap: spacing.md }}>
          <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>
            {i18n.t("board.column.settingsTitle")}
          </Text>

          <BottomSheetTextInput
            value={name}
            onChangeText={setName}
            placeholder={i18n.t("board.column.namePlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            maxLength={64}
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
            onPress={() => setIsDoneColumn((v) => !v)}
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
            onPress={save}
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
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);
