import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useSWRConfig } from "swr";
import { singleLineInput } from "@/components/ui/inputStyles";
import { useTheme } from "@/hooks/useTheme";
import { useMyStaff, MY_STAFF_KEY } from "@/hooks/useMyStaff";
import { useToast } from "@/hooks/useToast";
import { haptics } from "@/lib/haptics";
import { STAFF_PERSON_MAX_LENGTHS } from "@dragons/api-client";
import { meApi } from "@/lib/api";
import { buildStaffPatch, contactFields, contactLoadFailed, type ContactFields } from "@/lib/staff/my-staff";
import { i18n } from "@/lib/i18n";

/**
 * The coach's own contact data (#315), pushed inside the Profile sheet (#398)
 * instead of opening a second sheet over it. Three fields, all optional — a
 * coach who has no licence to name leaves it empty, and an emptied field
 * clears the stored one. The teams are shown but not editable: who trains
 * what is the admin's to say.
 *
 * The scroll view lifts the focused field clear of the keyboard itself
 * (`automaticallyAdjustKeyboardInsets`), and is the screen's first view so
 * the native header insets it.
 */
export default function ProfileContactScreen() {
  const theme = useTheme();
  const { colors, spacing, radius } = theme;
  const { data, error } = useMyStaff();
  const { mutate } = useSWRConfig();
  const toast = useToast();
  // Edits, once there are any. Until then the inputs read from the record, so a
  // sheet that opened a frame before SWR answered fills itself in rather than
  // staying blank — and a blank field would then be read as "clear it".
  const [edits, setEdits] = useState<ContactFields | null>(null);
  const [saving, setSaving] = useState(false);
  const fields = edits ?? contactFields(data);

  const patch = buildStaffPatch(fields, data);
  const canSubmit = patch !== null && !saving && data !== undefined;

  const submit = async () => {
    if (!patch || saving) return;
    setSaving(true);
    try {
      const updated = await meApi.updateStaff(patch);
      await mutate(MY_STAFF_KEY, updated, { revalidate: false });
      haptics.success();
      toast.show({ title: i18n.t("toast.saved"), variant: "success" });
      router.back();
    } catch {
      // The screen stays open with what was typed — a rejected email is fixed
      // in place rather than retyped from scratch.
      haptics.error();
      toast.show({ title: i18n.t("toast.saveFailed"), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const field = (
    key: keyof ContactFields,
    options: { keyboardType?: "phone-pad" | "email-address" } = {},
  ) => (
    <>
      <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
        {i18n.t(`profile.contact.${key}`)}
      </Text>
      <TextInput
        value={fields[key]}
        onChangeText={(value) => setEdits({ ...fields, [key]: value })}
        placeholder={i18n.t(`profile.contact.${key}Placeholder`)}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={options.keyboardType}
        autoCapitalize={key === "email" ? "none" : "sentences"}
        autoCorrect={false}
        // Read from the contract's own caps, so an over-long value is stopped
        // here rather than by a 400 — and cannot drift from the schema.
        maxLength={STAFF_PERSON_MAX_LENGTHS[key]}
        style={singleLineInput(theme)}
      />
    </>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
        {i18n.t("profile.contact.hint")} {i18n.t("profile.contact.editHint")}
      </Text>
      {/* The club's data being unreachable, not absent: Save stays disabled
          until there is a record to compare the edits against. */}
      {!data && contactLoadFailed(error) ? (
        <Text style={[theme.textStyles.body, { color: colors.destructive }]}>
          {i18n.t("profile.contact.loadFailed")}
        </Text>
      ) : null}
      {field("phone", { keyboardType: "phone-pad" })}
      {field("email", { keyboardType: "email-address" })}
      {field("licence")}

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void submit();
        }}
        disabled={!canSubmit}
        style={{
          backgroundColor: canSubmit ? colors.primary : colors.surfaceHigh,
          borderRadius: radius.md,
          padding: spacing.md,
          alignItems: "center",
          marginTop: spacing.sm,
        }}
      >
        {saving ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text
            style={{
              color: canSubmit ? colors.primaryForeground : colors.mutedForeground,
              fontSize: 16,
              fontWeight: "600",
            }}
          >
            {i18n.t("common.save")}
          </Text>
        )}
      </Pressable>

      {data && data.assignments.length > 0 ? (
        <View style={{ gap: spacing.xs, marginTop: spacing.lg }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
            {i18n.t("profile.contact.teams")}
          </Text>
          {data.assignments.map((assignment) => (
            <Text key={assignment.id} style={[theme.textStyles.body, { color: colors.foreground }]}>
              {assignment.teamName} · {i18n.t(`teamStaff.role.${assignment.role}`)}
            </Text>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}
