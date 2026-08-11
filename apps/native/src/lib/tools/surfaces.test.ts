import { describe, expect, it } from "vitest";

import { NATIVE_SURFACES } from "@/lib/tools/surfaces";
import { resolveDeepLink } from "@/lib/nav/href";

describe("NATIVE_SURFACES", () => {
  it("routes every surface at a screen this app actually declares", () => {
    // The field is a typed href, so this cannot drift while typecheck runs
    // with the generated route types — but the Today screen pushes these
    // routes at runtime, and the route table is what decides whether such a
    // path exists at all. Assert it here too, cheaply.
    for (const surface of Object.values(NATIVE_SURFACES)) {
      expect(resolveDeepLink(surface.route), surface.id).toBe(surface.route);
    }
  });

  it("keys every surface by its own id", () => {
    for (const [key, surface] of Object.entries(NATIVE_SURFACES)) {
      expect(surface.id).toBe(key);
    }
  });
});
