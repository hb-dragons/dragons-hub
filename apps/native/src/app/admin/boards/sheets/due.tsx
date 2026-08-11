import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { SheetScreen } from "@/components/sheets/SheetScreen";
import { useSheetResult } from "@/hooks/useSheetResult";
import { formatLocalDate, parseLocalDate } from "@/lib/format/local-date";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

export default function DuePickerSheetRoute() {
  const { current, result } = useLocalSearchParams<{ current?: string; result?: string }>();
  const [value, setValue] = useState<Date>(() =>
    current ? parseLocalDate(current) : new Date(),
  );
  const pick = useSheetResult<string | null>(result);
  const { colors, spacing, radius, isDark } = useTheme();

  return (
    <SheetScreen title={i18n.t("board.task.due")} testID="due-picker-sheet">
      {/*
        The sheet fits to this content (issue #219) instead of the 75% panel it
        used to float in. The picker itself still needs an explicit height: the
        iOS inline calendar is a native view with no intrinsic size, so left to
        Yoga it lays out at zero. ~360pt fits a month grid plus its month nav.
      */}
      <View style={Platform.OS === "ios" ? { height: 360, alignItems: "stretch" } : undefined}>
        <DateTimePicker
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          value={value}
          onChange={(_event, next) => {
            if (next) setValue(next);
          }}
          themeVariant={isDark ? "dark" : "light"}
          style={Platform.OS === "ios" ? { flex: 1 } : undefined}
        />
      </View>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Pressable
          onPress={() => pick(null)}
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
          onPress={() => pick(formatLocalDate(value))}
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
    </SheetScreen>
  );
}
