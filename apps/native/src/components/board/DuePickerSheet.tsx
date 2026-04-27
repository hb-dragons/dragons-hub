import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

export interface DuePickerHandle {
  /** `current` and `onPick` use YYYY-MM-DD strings — the server's `date` column. */
  open: (current: string | null, onPick: (date: string | null) => void) => void;
}

/**
 * Parse "YYYY-MM-DD" as a local-midnight Date, so the picker shows the same
 * day the user picked regardless of timezone. `new Date("2026-04-27")` would
 * parse as UTC midnight and shift left of UTC by a day.
 */
function parseLocalDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return new Date(iso);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Format a Date as local YYYY-MM-DD — what the server's date column expects. */
function formatLocalDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export const DuePickerSheet = forwardRef<DuePickerHandle>(function DuePickerSheet(_p, ref) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const onPickRef = useRef<(date: string | null) => void>(() => {});
  const [value, setValue] = useState<Date>(new Date());
  const snapPoints = useMemo(() => ["75%"], []);
  const { colors, spacing, radius, isDark } = useTheme();

  useImperativeHandle(
    ref,
    () => ({
      open: (current, onPick) => {
        setValue(current ? parseLocalDate(current) : new Date());
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
      <BottomSheetView style={{ padding: spacing.lg, gap: spacing.lg }} testID="due-picker-sheet">
        {/*
          iOS inline DateTimePicker collapses to 0 height inside a flex
          container — wrap it in a fixed-height View so the calendar is
          visible. ~360pt fits a month grid + month nav comfortably.
        */}
        <View style={Platform.OS === "ios" ? { height: 360, alignItems: "stretch" } : undefined}>
          <DateTimePicker
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            value={value}
            onChange={(_e, d) => {
              if (d) setValue(d);
            }}
            themeVariant={isDark ? "dark" : "light"}
            style={Platform.OS === "ios" ? { flex: 1 } : undefined}
          />
        </View>
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
              onPickRef.current(formatLocalDate(value));
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
