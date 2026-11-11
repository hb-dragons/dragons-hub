/** The slice of expo-router's router that closing a modal needs. */
export interface ModalRouter {
  canDismiss(): boolean;
  dismiss(): void;
  replace(href: "/" | "/today"): void;
}

/**
 * Close the modal the caller is shown in (#396): the page sheets' Done and
 * Close buttons (Profile, sign-in, the assistant).
 *
 * `dismiss` targets the modal itself. `router.back()` would not do for the
 * sheets with their own stack — Profile, sign-in — because it is dispatched to
 * the one-screen inner stack and fails instead of closing the sheet. A cold
 * deep link has nothing under the modal, so it lands on Home instead.
 */
export function dismissModal(router: ModalRouter): void {
  if (router.canDismiss()) {
    router.dismiss();
  } else {
    router.replace("/");
  }
}

/**
 * Close the modal, if there is one, and land on `href`: sign-in's way out
 * after a successful sign-in, which always ends on Today.
 */
export function dismissModalTo(router: ModalRouter, href: "/today"): void {
  if (router.canDismiss()) router.dismiss();
  router.replace(href);
}
