import type { ReactNode } from "react";
import { Alert, Linking, Platform, Pressable, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { isReferee, parseRoles, type RoleName } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { useLocale } from "@/hooks/useLocale";
import { lockLabels } from "@/lib/auth/lock-method";
import { useBiometricLock } from "@/hooks/useBiometricLock";
import { authClient } from "@/lib/auth-client";
import { performSignOut } from "@/lib/auth/sign-out";
import { confirmSignOut } from "@/lib/auth/sign-out-confirm";
import { profileGroups, type ProfileGroup, type ProfileRow } from "@/lib/nav/viewer-chrome";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import { Logo } from "@/components/brand/Logo";
import { Screen, UNDER_NATIVE_HEADER } from "@/components/Screen";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsGroup";
import { Segmented } from "@/components/ui/Segmented";
import { i18n, translate } from "@/lib/i18n";
import {
  LEGAL_LINKS,
  appVersionLabel,
  buildDeletionMailto,
  buildSupportMailto,
} from "@/lib/legal/links";
import { readAppVersion } from "@/lib/legal/app-version";
import { openExternal } from "@/lib/legal/open-external";
import { LOCALE_SEGMENTS, segmentLabels } from "@/lib/ui/preference-segments";

const GROUP_TITLE_KEYS: Record<ProfileGroup["id"], string | null> = {
  signIn: null,
  account: "profile.groups.account",
  app: "profile.groups.app",
  info: "profile.groups.info",
  session: null,
};

const ROLE_LABEL_KEYS: Record<RoleName, string> = {
  admin: "profile.roleAdmin",
  superadmin: "profile.roleSuperadmin",
  refereeAdmin: "profile.roleRefereeAdmin",
  venueManager: "profile.roleVenueManager",
  teamManager: "profile.roleTeamManager",
  coach: "profile.roleCoach",
};

/**
 * Profile (#398): a page sheet that reads like iOS Settings. Which groups and
 * rows appear, and in what order, is `profileGroups`' decision; this screen
 * only draws them. Rows that lead somewhere push inside the sheet's own stack.
 */
export default function ProfileScreen() {
  const { spacing } = useTheme();
  const { data: session } = authClient.useSession();
  const { isSupported } = useBiometricLock();
  const groups = profileGroups({ user: session?.user ?? null, lockSupported: isSupported, os: Platform.OS });

  return (
    <Screen edges={UNDER_NATIVE_HEADER}>
      <View style={{ marginTop: spacing.lg, gap: spacing.xl }}>
        {session ? <AccountCard user={session.user} /> : null}
        {groups.map((group) => {
          const titleKey = GROUP_TITLE_KEYS[group.id];
          return (
            <SettingsGroup key={group.id} title={titleKey ? i18n.t(titleKey) : undefined}>
              {group.rows.map((row) => (
                <Row key={row} row={row} email={session?.user.email} />
              ))}
            </SettingsGroup>
          );
        })}
      </View>
    </Screen>
  );
}

function Row({ row, email }: { row: ProfileRow; email: string | undefined }) {
  const router = useRouter();
  const version = readAppVersion();

  switch (row) {
    case "signIn":
      return <SignInBlock />;
    case "contact":
      return (
        <SettingsRow push label={i18n.t("profile.contact.title")} onPress={() => router.push("/profile/contact")} />
      );
    case "notifications":
      return (
        <SettingsRow push label={i18n.t("push.settingsRow")} onPress={() => router.push("/profile/notifications")} />
      );
    case "lock":
      return <LockRow />;
    case "language":
      return <LanguageRow />;
    case "languageSettings":
      return <LanguageSettingsRow />;
    case "privacy":
      return <SettingsRow role="link" label={i18n.t("legal.privacy")} onPress={() => openExternal(LEGAL_LINKS.privacy)} />;
    case "imprint":
      return <SettingsRow role="link" label={i18n.t("legal.imprint")} onPress={() => openExternal(LEGAL_LINKS.imprint)} />;
    case "support":
      return (
        <SettingsRow
          role="link"
          label={i18n.t("legal.support")}
          onPress={() => openExternal(buildSupportMailto({ ...version, platform: Platform.OS }))}
        />
      );
    case "version":
      return <SettingsRow label={i18n.t("profile.version")} value={appVersionLabel(version)} />;
    case "signOut":
      return (
        <SettingsRow
          destructive
          label={i18n.t("profile.signOut")}
          onPress={() =>
            confirmSignOut({
              alert: (title, message, buttons) => Alert.alert(title, message, buttons),
              // Same routine as the 401-triggered forced sign-out, so the next
              // user on this device never sees this user's cached data.
              signOut: performSignOut,
              t: (key) => i18n.t(key),
            })
          }
        />
      );
    case "deleteAccount":
      return (
        <SettingsRow
          destructive
          role="link"
          label={i18n.t("legal.deleteAccount")}
          onPress={() =>
            openExternal(buildDeletionMailto({ email: email ?? "", version: appVersionLabel(version) }))
          }
        />
      );
  }
}

/** "Mit Face ID sperren": the toggle names the device's method (#399). */
function LockRow() {
  const { isEnabled, method, toggle } = useBiometricLock();
  const label = lockLabels(method, translate).toggle;
  return (
    <SettingsRow
      label={label}
      accessory={<Switch accessibilityLabel={label} value={isEnabled} onValueChange={() => void toggle()} />}
    />
  );
}

/**
 * iOS (#399): the language is set on the app's page in iOS Settings, which
 * lists the languages `app.json` declares. The row shows the current one and
 * opens that page.
 */
function LanguageSettingsRow() {
  const { locale } = useLocale();
  return (
    <SettingsRow
      push
      role="link"
      label={i18n.t("profile.language")}
      value={i18n.t(locale === "de" ? "profile.languageDe" : "profile.languageEn")}
      hint={i18n.t("profile.languageSettingsHint")}
      onPress={() => void Linking.openSettings()}
    />
  );
}

function LanguageRow() {
  const { pref, setPref } = useLocale();
  return (
    <SegmentRow label={i18n.t("profile.language")}>
      <Segmented
        segments={segmentLabels(LOCALE_SEGMENTS, (key) => i18n.t(key))}
        selected={pref}
        onSelect={setPref}
      />
    </SegmentRow>
  );
}

/** A row whose control sits under its label: the segmented pickers. */
function SegmentRow({ label, children }: { label: string; children: ReactNode }) {
  const { colors, spacing, textStyles } = useTheme();
  return (
    <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm }}>
      <Text style={[textStyles.body, { color: colors.foreground }]}>{label}</Text>
      {children}
    </View>
  );
}

function SignInBlock() {
  const router = useRouter();
  const { colors, textStyles, spacing, radius } = useTheme();
  return (
    <View style={{ padding: spacing.lg, alignItems: "center", gap: spacing.sm }}>
      <Text style={[textStyles.sectionTitle, { color: colors.foreground, textAlign: "center" }]}>
        {i18n.t("auth.staffSignInPrompt")}
      </Text>
      <Text style={[textStyles.body, { color: colors.mutedForeground, textAlign: "center" }]}>
        {i18n.t("auth.staffSignInHint")}
      </Text>
      <Pressable
        accessibilityRole="button"
        // Replaces the Profile sheet rather than stacking the full-screen
        // sign-in on top of it; sign-in closes itself and lands on Today.
        onPress={() => router.replace("/(auth)/sign-in")}
        style={{
          marginTop: spacing.sm,
          backgroundColor: colors.primary,
          borderRadius: radius.md,
          paddingHorizontal: spacing.xl,
          paddingVertical: spacing.md,
        }}
      >
        <Text style={[textStyles.button, { color: colors.primaryForeground }]}>{i18n.t("auth.signIn")}</Text>
      </Pressable>
    </View>
  );
}

function AccountCard({
  user,
}: {
  user: { name: string; email: string; role?: string | null; refereeId?: number | null };
}) {
  const { colors, textStyles, spacing } = useTheme();
  const roleNames = parseRoles(typeof user.role === "string" ? user.role : null);
  const showRefereeBadge = isReferee(user);
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <Logo size={48} />
        <View style={{ flex: 1 }}>
          <Text style={[textStyles.cardTitle, { color: colors.foreground, marginBottom: spacing.xs }]}>
            {user.name}
          </Text>
          <Text style={[textStyles.body, { color: colors.mutedForeground }]}>{user.email}</Text>
        </View>
      </View>
      {roleNames.length > 0 || showRefereeBadge ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.md }}>
          {roleNames.map((name) => (
            <Badge key={name} label={i18n.t(ROLE_LABEL_KEYS[name])} variant="secondary" />
          ))}
          {showRefereeBadge ? <Badge label={i18n.t("profile.roleReferee")} variant="secondary" /> : null}
        </View>
      ) : null}
    </Card>
  );
}
