import { Pressable, Text, View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

/** First-interaction AI notice (AI Act Art. 50(1), ADR 0005). */
export function AiNoticeCard({ onAcknowledge }: { onAcknowledge: () => void }) {
  const { colors, spacing, radius, textStyles } = useTheme();
  return (
    <View
      accessibilityRole="summary"
      style={{
        marginTop: spacing.xl,
        padding: spacing.lg,
        gap: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceLow,
      }}
    >
      <Text style={[textStyles.sectionTitle, { color: colors.foreground }]}>
        {i18n.t("assistant.notice.title")}
      </Text>
      <Text style={[textStyles.body, { color: colors.foreground }]}>
        {i18n.t("assistant.notice.body")}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onAcknowledge}
        style={{
          backgroundColor: colors.primary,
          borderRadius: radius.md,
          paddingVertical: spacing.md,
          alignItems: "center",
          minHeight: 44,
        }}
      >
        <Text style={[textStyles.button, { color: colors.primaryForeground }]}>
          {i18n.t("assistant.notice.acknowledge")}
        </Text>
      </Pressable>
    </View>
  );
}
