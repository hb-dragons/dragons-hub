/** The subset of React Native's `AlertButton` the confirmation uses. */
export type AlertButton = {
  text: string;
  style: "cancel" | "destructive";
  onPress?: () => void;
};

/**
 * Abmelden on Profile asks first (#398): signing out is a deliberate act a
 * stray tap in a settings list should not trigger, and it costs the user a
 * full sign-in to undo. Abbrechen is the cancel button, Abmelden the
 * destructive one, which is how iOS lays out and colours the pair.
 *
 * The alert, the routine and the translator come in from the screen, so this
 * runs without React Native.
 */
export function confirmSignOut(deps: {
  alert: (title: string, message: string | undefined, buttons: AlertButton[]) => void;
  signOut: () => Promise<void>;
  t: (key: string) => string;
}): void {
  const { alert, signOut, t } = deps;
  alert(t("profile.signOutConfirmTitle"), undefined, [
    { text: t("common.cancel"), style: "cancel" },
    {
      text: t("profile.signOut"),
      style: "destructive",
      onPress: () => {
        void signOut();
      },
    },
  ]);
}
