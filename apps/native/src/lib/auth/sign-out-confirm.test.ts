import { describe, expect, it, vi } from "vitest";
import { confirmSignOut, type AlertButton } from "./sign-out-confirm";

const t = (key: string) => `t:${key}`;

/** Runs the confirmation and returns the buttons the alert was shown with. */
function show() {
  const alert = vi.fn<(title: string, message: string | undefined, buttons: AlertButton[]) => void>();
  const signOut = vi.fn(() => Promise.resolve());
  confirmSignOut({ alert, signOut, t });
  const [title, message, buttons] = alert.mock.calls[0]!;
  return { title, message, buttons, signOut };
}

describe("confirmSignOut", () => {
  it("asks before signing out, and signs nothing out by asking", () => {
    const { title, signOut } = show();
    expect(title).toBe("t:profile.signOutConfirmTitle");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("offers Abbrechen first and Abmelden as the destructive choice", () => {
    const { buttons } = show();
    expect(buttons.map((b) => [b.text, b.style])).toEqual([
      ["t:common.cancel", "cancel"],
      ["t:profile.signOut", "destructive"],
    ]);
  });

  it("leaves the session alone on Abbrechen", () => {
    const { buttons, signOut } = show();
    buttons[0]!.onPress?.();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("runs the sign-out routine on Abmelden", () => {
    const { buttons, signOut } = show();
    buttons[1]!.onPress?.();
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
