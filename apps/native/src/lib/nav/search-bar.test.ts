import { describe, expect, it, vi } from "vitest";
import { searchFieldOptions } from "@/lib/nav/search-bar";

/**
 * The native header search field, as both of its call sites configure it
 * (issue #223). The screen brings a placeholder, a placement and what to do
 * with the text; everything else about the field is decided here once.
 */

const changeEvent = (text: string) =>
  ({ nativeEvent: { text } }) as Parameters<
    NonNullable<ReturnType<typeof searchFieldOptions>["onChangeText"]>
  >[0];

const cancelEvent = () =>
  ({ nativeEvent: {} }) as Parameters<
    NonNullable<ReturnType<typeof searchFieldOptions>["onCancelButtonPress"]>
  >[0];

describe("searchFieldOptions", () => {
  const build = (overrides: Partial<Parameters<typeof searchFieldOptions>[0]> = {}) =>
    searchFieldOptions({
      placeholder: "Search by name…",
      placement: "stacked",
      onChangeText: vi.fn(),
      onCancel: vi.fn(),
      ...overrides,
    });

  it("carries the placeholder and placement through", () => {
    const options = build({ placement: "integrated" });
    expect(options.placeholder).toBe("Search by name…");
    expect(options.placement).toBe("integrated");
  });

  // The screens below these fields are lists that are scrolled while searching;
  // a field that hides on scroll would take the query out of sight mid-read.
  it("keeps the field visible while the list scrolls", () => {
    expect(build().hideWhenScrolling).toBe(false);
  });

  it("does not capitalize what is typed — these are search queries, not prose", () => {
    expect(build().autoCapitalize).toBe("none");
  });

  // The native field reports through a synthetic event; every caller used to
  // unwrap `e.nativeEvent.text` itself.
  it("hands the caller the text, not the native event", () => {
    const onChangeText = vi.fn();
    build({ onChangeText }).onChangeText?.(changeEvent("schmi"));
    expect(onChangeText).toHaveBeenCalledExactlyOnceWith("schmi");
  });

  it("reports the cancel button as its own action", () => {
    const onCancel = vi.fn();
    build({ onCancel }).onCancelButtonPress?.(cancelEvent());
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
