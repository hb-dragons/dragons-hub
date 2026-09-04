import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput } from "react-native";
import { router } from "expo-router";
import { useSWRConfig } from "swr";
import { SheetScreen } from "@/components/sheets/SheetScreen";
import { singleLineInput } from "@/components/ui/inputStyles";
import { useTheme } from "@/hooks/useTheme";
import { useMyStaff, MY_STAFF_KEY } from "@/hooks/useMyStaff";
import { useToast } from "@/hooks/useToast";
import { haptics } from "@/lib/haptics";
import { STAFF_PERSON_MAX_LENGTHS } from "@dragons/api-client";
import { meApi } from "@/lib/api";
import { buildStaffPatch, contactFields, type ContactFields } from "@/lib/staff/my-staff";
import { i18n } from "@/lib/i18n";

/**
 * The coach's own contact data, edited (#315).
 *
 * A form sheet like the board's, and for the same reason: the keyboard is up
 * for most of its life and the system owns the presentation. Three fields, all
 * optional — a coach who has no licence to name leaves it empty, and an emptied
 * field clears the stored one.
 *
 * The record is read through the same SWR key the profile section renders from,
 * so the sheet opens on data that is already there and the save writes back
 * into it.
 */
export default function ProfileContactSheetRoute() {
  const theme = useTheme();
  const { colors, spacing, radius } = theme;
  const { data } = useMyStaff();
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
      // The sheet stays open with what was typed — a rejected email is fixed
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
    <SheetScreen title={i18n.t("profile.contact.editTitle")} layout="scroll" testID="profile-contact-sheet">
      <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
        {i18n.t("profile.contact.editHint")}
      </Text>
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
    </SheetScreen>
  );
}
