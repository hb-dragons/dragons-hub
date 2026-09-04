import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import type { MyStaffProfile } from "@dragons/shared";
import { APIError } from "@dragons/api-client";
import { Card } from "@/components/Card";
import { SectionHeader } from "@/components/SectionHeader";
import { useTheme } from "@/hooks/useTheme";
import { useMyStaff } from "@/hooks/useMyStaff";
import { i18n } from "@/lib/i18n";

/**
 * "Meine Kontaktdaten" on the profile screen (#315): what the club holds on a
 * coach, and the way into editing the three fields the coach owns. The teams
 * are shown but not editable here — who trains what is the admin's to say.
 *
 * Rendered only for a session linked to a staff person, so a 404 here means the
 * link went away while the app was open: the section then draws nothing, the
 * same as for an account that never had one. Any other failure is the club's
 * data being unreachable, not absent, and says so.
 */
export function StaffContactSection() {
  const { colors, textStyles, spacing } = useTheme();
  const { data, error, isLoading } = useMyStaff();

  if (error instanceof APIError && error.status === 404) return null;

  return (
    <View>
      <SectionHeader title={i18n.t("profile.contact.title")} subtitle={i18n.t("profile.contact.hint")} />
      <Card>
        {error ? (
          <Text style={[textStyles.body, { color: colors.mutedForeground }]}>
            {i18n.t("profile.contact.loadFailed")}
          </Text>
        ) : isLoading || !data ? (
          <ActivityIndicator color={colors.mutedForeground} />
        ) : (
          <View style={{ gap: spacing.md }}>
            <ContactRow label={i18n.t("profile.contact.phone")} value={data.phone} />
            <ContactRow label={i18n.t("profile.contact.email")} value={data.email} />
            <ContactRow label={i18n.t("profile.contact.licence")} value={data.licence} />
            <Teams profile={data} />
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/profile-contact")}
              style={({ pressed }) => [{ minHeight: 44, justifyContent: "center" }, pressed && { opacity: 0.6 }]}
            >
              <Text style={[textStyles.button, { color: colors.primary }]}>{i18n.t("common.edit")}</Text>
            </Pressable>
          </View>
        )}
      </Card>
    </View>
  );
}

function ContactRow({ label, value }: { label: string; value: string | null }) {
  const { colors, textStyles, spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[textStyles.body, { color: value ? colors.foreground : colors.mutedForeground }]}>
        {value ?? i18n.t("profile.contact.notSet")}
      </Text>
    </View>
  );
}

function Teams({ profile }: { profile: MyStaffProfile }) {
  const { colors, textStyles, spacing } = useTheme();
  if (profile.assignments.length === 0) return null;
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
        {i18n.t("profile.contact.teams")}
      </Text>
      {profile.assignments.map((assignment) => (
        <Text key={assignment.id} style={[textStyles.body, { color: colors.foreground }]}>
          {assignment.teamName} · {i18n.t(`teamStaff.role.${assignment.role}`)}
        </Text>
      ))}
    </View>
  );
}
