import { describe, expect, it, vi } from "vitest";

vi.mock("expo-application", () => ({
  nativeApplicationVersion: "1.0.0",
  nativeBuildVersion: "5",
}));

import { readAppVersion } from "@/lib/legal/app-version";

describe("readAppVersion", () => {
  it("reads the marketing version and the build number from the binary", () => {
    expect(readAppVersion()).toEqual({ version: "1.0.0", build: "5" });
  });
});
