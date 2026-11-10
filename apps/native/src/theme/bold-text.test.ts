import { describe, expect, it } from "vitest";
import { fontFamilies } from "./font-families";
import { boldTextFamily, resolveFontFamilies, resolveTextStyles } from "./bold-text";

describe("boldTextFamily", () => {
  it.each([
    [fontFamilies.body, fontFamilies.body],
    [fontFamilies.bodyMedium, fontFamilies.bodyMedium],
    [fontFamilies.bodySemiBold, fontFamilies.bodySemiBold],
    [fontFamilies.display, fontFamilies.display],
  ])("leaves %s alone while Bold Text is off", (family, expected) => {
    expect(boldTextFamily(family, false)).toBe(expected);
  });

  it.each([
    // Regular and Medium content text both become the semibold face.
    [fontFamilies.body, fontFamilies.bodySemiBold],
    [fontFamilies.bodyMedium, fontFamilies.bodySemiBold],
    // Text that was already emphasised steps up once more, so an own-club
    // name stays heavier than the opponent's next to it.
    [fontFamilies.bodySemiBold, fontFamilies.display],
    // Bold is the heaviest file shipped; it stays.
    [fontFamilies.display, fontFamilies.display],
  ])("maps %s to %s while Bold Text is on", (family, expected) => {
    expect(boldTextFamily(family, true)).toBe(expected);
  });
});

describe("resolveFontFamilies", () => {
  it("is the static table while Bold Text is off", () => {
    expect(resolveFontFamilies(false)).toEqual(fontFamilies);
  });

  it("puts body text on the semibold face while Bold Text is on", () => {
    const families = resolveFontFamilies(true);
    expect(families.body).toBe(fontFamilies.bodySemiBold);
    expect(families.bodyMedium).toBe(fontFamilies.bodySemiBold);
    expect(families.displayMedium).toBe(fontFamilies.bodySemiBold);
    expect(families.bodySemiBold).toBe(fontFamilies.display);
    expect(families.display).toBe(fontFamilies.display);
  });

  it("keeps every semantic key", () => {
    expect(Object.keys(resolveFontFamilies(true)).sort()).toEqual(
      Object.keys(fontFamilies).sort(),
    );
  });
});

describe("resolveTextStyles", () => {
  // A fixture rather than the real `textStyles`: typography.ts require()s the
  // .ttf assets, which vitest's node transform cannot parse.
  const styles = {
    body: { fontFamily: fontFamilies.body, fontSize: 15, lineHeight: 22 },
    score: { fontFamily: fontFamilies.display, fontSize: 36, lineHeight: 42 },
  } as const;

  it("returns the same object while Bold Text is off", () => {
    expect(resolveTextStyles(styles, false)).toBe(styles);
  });

  it("swaps only the family while Bold Text is on", () => {
    const resolved = resolveTextStyles(styles, true);
    expect(resolved.body).toEqual({
      fontFamily: fontFamilies.bodySemiBold,
      fontSize: 15,
      lineHeight: 22,
    });
    expect(resolved.score.fontFamily).toBe(fontFamilies.display);
  });
});
