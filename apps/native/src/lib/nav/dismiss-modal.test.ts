import { describe, expect, it, vi } from "vitest";
import { dismissModal, dismissModalTo, type ModalRouter } from "./dismiss-modal";

function fakeRouter(canDismiss: boolean): ModalRouter {
  return { canDismiss: () => canDismiss, dismiss: vi.fn(), replace: vi.fn() };
}

describe("dismissModal", () => {
  it("closes the modal it is shown in", () => {
    const router = fakeRouter(true);
    dismissModal(router);
    expect(router.dismiss).toHaveBeenCalledOnce();
    expect(router.replace).not.toHaveBeenCalled();
  });

  // A cold deep link opens the modal with nothing underneath to return to.
  it("lands on Home when nothing sits under the modal", () => {
    const router = fakeRouter(false);
    dismissModal(router);
    expect(router.dismiss).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/");
  });
});

describe("dismissModalTo", () => {
  it.each([true, false])("lands on the given route whether or not a modal closes (canDismiss %s)", (canDismiss) => {
    const router = fakeRouter(canDismiss);
    dismissModalTo(router, "/today");
    expect(router.dismiss).toHaveBeenCalledTimes(canDismiss ? 1 : 0);
    expect(router.replace).toHaveBeenCalledWith("/today");
  });
});
