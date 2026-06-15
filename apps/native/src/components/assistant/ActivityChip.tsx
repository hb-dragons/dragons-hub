import { ActivityIndicator, Text, View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { toolChip } from "@/lib/assistant/tool-parts";
import type { UiPart } from "@/lib/assistant/messages";

const KNOWN = new Set(["get_standings", "get_dashboard", "list_matches"]);

export function ActivityChip({ part }: { part: UiPart }) {
  const { colors, spacing, radius, textStyles } = useTheme();
  const chip = toolChip(part);
  if (!chip) return null;

  const what = i18n.t(`assistant.tools.${KNOWN.has(chip.toolKey) ? chip.toolKey : "fallback"}`);

  if (chip.status === "running") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, alignSelf: "flex-start", backgroundColor: colors.secondary, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2, marginBottom: spacing.xs }}>
        <ActivityIndicator size="small" color={colors.secondaryForeground} />
        <Text style={[textStyles.caption, { color: colors.secondaryForeground }]}>{i18n.t("assistant.activity.checking", { what })}</Text>
      </View>
    );
  }
  if (chip.status === "error") {
    return <Text style={[textStyles.caption, { color: colors.destructive, marginBottom: spacing.xs }]}>{i18n.t("assistant.activity.failed", { what })}</Text>;
  }
  return <Text style={[textStyles.caption, { color: colors.mutedForeground, marginBottom: spacing.xs }]}>{`✓ ${i18n.t("assistant.activity.checked", { what })}`}</Text>;
}
