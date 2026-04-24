import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

export interface DuePickerHandle {
  open: (current: string | null, onPick: (iso: string | null) => void) => void;
}

export const DuePickerSheet = forwardRef<DuePickerHandle>(function DuePickerSheet(_p, ref) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const onPickRef = useRef<(iso: string | null) => void>(() => {});
  const [value, setValue] = useState<Date>(new Date());
  const snapPoints = useMemo(() => ["50%"], []);
  const { colors, spacing, radius, isDark } = useTheme();

  useImperativeHandle(
    ref,
    () => ({
      open: (current, onPick) => {
        setValue(current ? new Date(current) : new Date());
        onPickRef.current = onPick;
        sheetRef.current?.present();
      },
    }),
    [],
  );

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      backgroundStyle={{ backgroundColor: colors.background }}
      handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
      enablePanDownToClose
    >
      <BottomSheetView style={{ padding: spacing.lg, gap: spacing.lg }}>
        <DateTimePicker
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          value={value}
          onChange={(_e, d) => {
            if (d) setValue(d);
          }}
          themeVariant={isDark ? "dark" : "light"}
        />
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Pressable
            onPress={() => {
              onPickRef.current(null);
              sheetRef.current?.dismiss();
            }}
            accessibilityRole="button"
            accessibilityLabel={i18n.t("board.due.clear")}
            style={{
              flex: 1,
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceBase,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
            }}
          >
            <Text style={{ color: colors.foreground, fontWeight: "600" }}>
              {i18n.t("board.due.clear")}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              onPickRef.current(value.toISOString());
              sheetRef.current?.dismiss();
            }}
            accessibilityRole="button"
            accessibilityLabel={i18n.t("board.due.set")}
            style={{
              flex: 1,
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor: colors.primary,
              alignItems: "center",
            }}
          >
            <Text style={{ color: colors.primaryForeground, fontWeight: "600" }}>
              {i18n.t("board.due.set")}
            </Text>
          </Pressable>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
});
