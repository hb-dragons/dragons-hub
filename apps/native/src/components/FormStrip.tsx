import { View, Text } from "react-native";
import type { FormEntry } from "@dragons/shared";
import { useTheme } from "../hooks/useTheme";
import { i18n } from "../lib/i18n";

interface FormStripProps {
  form: FormEntry[];
  size?: number;
}

export function FormStrip({ form, size = 28 }: FormStripProps) {
  const { colors, radius, spacing } = useTheme();

  return (
    <View style={{ flexDirection: "row", gap: spacing.xs }}>
      {form.map((entry, index) => {
        const isWin = entry.result === "W";
        return (
          <View
            key={`${entry.matchId}-${index}`}
            style={{
              width: size,
              height: size,
              borderRadius: radius.md,
              backgroundColor: isWin
                ? colors.chart1 + "1A"
                : colors.destructive + "1A",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: isWin ? colors.chart1 : colors.destructive,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {isWin ? i18n.t("match.win") : i18n.t("match.loss")}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
