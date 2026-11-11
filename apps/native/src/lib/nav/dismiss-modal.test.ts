import { describe, expect, it, vi } from "vitest";
import { dismissModal, dismissModalTo, returnHome, type ModalRouter } from "./dismiss-modal";

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

describe("returnHome", () => {
  function stackedRouter(canDismiss: boolean) {
    const calls: string[] = [];
    const router = {
      canDismiss: () => canDismiss,
      dismissAll: vi.fn(() => calls.push("dismissAll")),
      replace: vi.fn((href: string) => calls.push(`replace ${href}`)),
    };
    return { router, calls };
  }

  // Replacing from inside a sheet swaps the sheet for a second tab bar on the
  // root stack; everything above the tabs is closed first instead.
  it("closes everything above the tabs, then lands on Home", () => {
    const { router, calls } = stackedRouter(true);
    returnHome(router);
    expect(calls).toEqual(["dismissAll", "replace /"]);
  });

  it("only lands on Home when nothing is stacked above the tabs", () => {
    const { router, calls } = stackedRouter(false);
    returnHome(router);
    expect(calls).toEqual(["replace /"]);
  });
});
