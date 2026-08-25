import type { ReactNode } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { SectionHeader } from "@/components/SectionHeader";
import { LEGAL_LINKS, appVersionLabel, buildSupportMailto } from "@/lib/legal/links";
import { readAppVersion } from "@/lib/legal/app-version";
import { openExternal } from "@/lib/legal/open-external";

export function LegalRow({
  label,
  onPress,
  destructive = false,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const { colors, textStyles, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [
        { paddingVertical: spacing.md, minHeight: 44, justifyContent: "center" },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Text style={[textStyles.body, { color: destructive ? colors.destructive : colors.foreground }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The "Rechtliches" group: Datenschutz, Impressum, support mail and the
 * installed version. Rendered on Profile signed out and signed in; the
 * signed-in branch appends its account rows through `children` so the whole
 * group stays one list (#233, #234).
 */
export function LegalSection({ children }: { children?: ReactNode }) {
  const { colors, textStyles, spacing } = useTheme();
  const version = readAppVersion();

  return (
    <View>
      <SectionHeader title={i18n.t("legal.title")} />
      <LegalRow label={i18n.t("legal.privacy")} onPress={() => openExternal(LEGAL_LINKS.privacy)} />
      <LegalRow label={i18n.t("legal.imprint")} onPress={() => openExternal(LEGAL_LINKS.imprint)} />
      <LegalRow
        label={i18n.t("legal.support")}
        onPress={() => openExternal(buildSupportMailto({ ...version, platform: Platform.OS }))}
      />
      {children}
      <Text style={[textStyles.caption, { color: colors.mutedForeground, paddingVertical: spacing.sm }]}>
        {i18n.t("legal.version", { version: appVersionLabel(version) })}
      </Text>
    </View>
  );
}
