import { describe, expect, it } from "vitest";
import { detailHeaderOptions, tabRootHeaderOptions } from "@/lib/nav/headers";

/**
 * The two native header shapes the app declares. Everything these objects do
 * *not* say is as deliberate as what they do: an option left unset is one the
 * system decides, which is the whole point of moving to native headers.
 */

describe("tabRootHeaderOptions", () => {
  const options = tabRootHeaderOptions("Schedule");

  it("shows a large title that collapses on scroll", () => {
    expect(options.headerShown).toBe(true);
    expect(options.headerLargeTitleEnabled).toBe(true);
  });

  it("carries the title through", () => {
    expect(options.title).toBe("Schedule");
  });

  it("uses the minimal back-button display mode", () => {
    // `/league-tables` is pushed and shares these options, so it does get a
    // back button. "minimal" is the supported way to drop the back *title*.
    expect(options.headerBackButtonDisplayMode).toBe("minimal");
  });

  it("leaves the scroll-edge treatment to the system", () => {
    // A transparent/blurred header or an explicit background colour is painted
    // by us and then swapped for the system glass during a transition, which
    // flashes; `scrollEdgeEffects` already defaults to "automatic" per edge.
    expect(options.headerTransparent).toBeUndefined();
    expect(options.headerBlurEffect).toBeUndefined();
    expect(options.headerStyle).toBeUndefined();
    expect(options.headerShadowVisible).toBeUndefined();
    expect(options.headerLargeTitleShadowVisible).toBeUndefined();
  });

  it("leaves the large title in the system font", () => {
    // The brand display face belongs in the content layer and on the Home
    // wordmark, not in system chrome.
    expect(options.headerLargeTitleStyle).toBeUndefined();
    expect(options.headerTitleStyle).toBeUndefined();
  });
});

describe("detailHeaderOptions", () => {
  const tint = "#ffffff";
  const background = "#131313";

  describe("on iOS", () => {
    const options = detailHeaderOptions({ tintColor: tint, backgroundColor: background, os: "ios" });

    it("floats a transparent, title-less header over the content", () => {
      // The system draws glass under the chevron and insets the screen's first
      // scroll view for the header (`contentInsetAdjustmentBehavior`).
      expect(options.headerShown).toBe(true);
      expect(options.headerTransparent).toBe(true);
      expect(options.headerTitle).toBe("");
    });

    it("paints no background of its own", () => {
      // An explicit colour is painted solid and then swapped for the system
      // glass mid-transition, which flashes.
      expect(options.headerStyle).toBeUndefined();
    });

    it("tints the back chevron with the passed colour", () => {
      expect(options.headerTintColor).toBe(tint);
    });

    it("drops the back title through the display mode, not a zero font size", () => {
      expect(options.headerBackButtonDisplayMode).toBe("minimal");
      expect(options.headerBackTitle).toBeUndefined();
      expect(options.headerBackTitleStyle).toBeUndefined();
    });
  });

  describe("on Android", () => {
    const options = detailHeaderOptions({ tintColor: tint, backgroundColor: background, os: "android" });

    it("draws an opaque header in the theme background so content starts below it", () => {
      // Android has no glass and `contentInsetAdjustmentBehavior` is an iOS
      // prop, so under a transparent header the content was laid out from the
      // top of the screen — behind the status bar and the back button.
      expect(options.headerShown).toBe(true);
      expect(options.headerTransparent).toBe(false);
      expect(options.headerStyle).toEqual({ backgroundColor: background });
    });

    it("keeps the same title-less, minimal-back shape", () => {
      expect(options.headerTitle).toBe("");
      expect(options.headerTintColor).toBe(tint);
      expect(options.headerBackButtonDisplayMode).toBe("minimal");
    });
  });
});
