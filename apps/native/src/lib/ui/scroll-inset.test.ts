import { describe, expect, it } from "vitest";
import { contentInsetBehaviorForEdges } from "@/lib/ui/scroll-inset";

describe("contentInsetBehaviorForEdges", () => {
  it("uses 'never' when SafeAreaView reserves the top edge", () => {
    expect(contentInsetBehaviorForEdges(["top"])).toBe("never");
    expect(contentInsetBehaviorForEdges(["top", "bottom"])).toBe("never");
  });

  it("uses 'automatic' under a native header (no top edge)", () => {
    // Screens with a native large-title header pass edges={[]}; the native
    // stack only insets content when the scroll view opts into "automatic".
    expect(contentInsetBehaviorForEdges([])).toBe("automatic");
    expect(contentInsetBehaviorForEdges(["bottom"])).toBe("automatic");
  });
});
