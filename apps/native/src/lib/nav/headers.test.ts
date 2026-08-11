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
  const options = detailHeaderOptions("#ffffff");

  it("floats a transparent, title-less header over the content", () => {
    expect(options.headerShown).toBe(true);
    expect(options.headerTransparent).toBe(true);
    expect(options.headerTitle).toBe("");
  });

  it("tints the back chevron with the passed colour", () => {
    expect(options.headerTintColor).toBe("#ffffff");
  });

  it("drops the back title through the display mode, not a zero font size", () => {
    expect(options.headerBackButtonDisplayMode).toBe("minimal");
    expect(options.headerBackTitle).toBeUndefined();
    expect(options.headerBackTitleStyle).toBeUndefined();
  });
});
