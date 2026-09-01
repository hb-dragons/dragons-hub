import { describe, expect, it } from "vitest";

import RootPage from "./page";

describe("root page", () => {
  it("redirects to /admin", () => {
    let thrown: unknown;
    try {
      RootPage();
    } catch (error) {
      thrown = error;
    }
    // next/navigation's redirect() signals via a thrown control-flow error
    // whose digest encodes the target URL.
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as { digest?: string }).digest).toContain("NEXT_REDIRECT");
    expect((thrown as { digest?: string }).digest).toContain("/admin");
  });
});
