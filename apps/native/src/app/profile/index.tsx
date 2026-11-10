import type { ReactNode } from "react";
import { Alert, Platform, Pressable, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { isReferee, parseRoles, type RoleName } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { useLocale } from "@/hooks/useLocale";
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
import { i18n } from "@/lib/i18n";
import { LEGAL_LINKS, appVersionLabel, buildSupportMailto } from "@/lib/legal/links";
import { useAccountClosure } from "@/hooks/useAccountClosure";
import { closureRequestedDate, isClosureRequested } from "@/lib/account/closure";
import { readAppVersion } from "@/lib/legal/app-version";
import { openExternal } from "@/lib/legal/open-external";
import { LOCALE_SEGMENTS, THEME_SEGMENTS, segmentLabels } from "@/lib/ui/preference-segments";

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
  const { data: closure } = useAccountClosure();
  const groups = profileGroups({
    user: session?.user ?? null,
    lockSupported: isSupported,
    closureRequested: isClosureRequested(closure),
  });

  return (
    <Screen edges={UNDER_NATIVE_HEADER}>
      <View style={{ marginTop: spacing.lg, gap: spacing.xl }}>
        {session ? <AccountCard user={session.user} /> : null}
        {groups.map((group) => {
          const titleKey = GROUP_TITLE_KEYS[group.id];
          return (
            <SettingsGroup key={group.id} title={titleKey ? i18n.t(titleKey) : undefined}>
              {group.rows.map((row) => (
                <Row key={row} row={row} />
              ))}
            </SettingsGroup>
          );
        })}
      </View>
    </Screen>
  );
}

function Row({ row }: { row: ProfileRow }) {
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
    case "appearance":
      return <AppearanceRow />;
    case "language":
      return <LanguageRow />;
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
          push
          label={i18n.t("profile.closure.row")}
          onPress={() => router.push("/profile/account-closure")}
        />
      );
    case "closureRequested":
      return <ClosureRequestedRow />;
  }
}

/** The day the closure request was made, in place of Konto löschen (#400). */
function ClosureRequestedRow() {
  const { data } = useAccountClosure();
  if (!data?.request) return null;
  return (
    <SettingsRow
      label={i18n.t("profile.closure.requested", {
        date: closureRequestedDate(data.request.requestedAt, i18n.locale),
      })}
    />
  );
}

function LockRow() {
  const { isEnabled, toggle } = useBiometricLock();
  return (
    <SettingsRow
      label={i18n.t("profile.biometricLock")}
      accessory={<Switch value={isEnabled} onValueChange={() => void toggle()} />}
    />
  );
}

function AppearanceRow() {
  const { mode, setMode } = useTheme();
  return (
    <SegmentRow label={i18n.t("profile.theme")}>
      <Segmented
        segments={segmentLabels(THEME_SEGMENTS, (key) => i18n.t(key))}
        selected={mode}
        onSelect={setMode}
      />
    </SegmentRow>
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
