import { describe, expect, it } from "vitest";

import { publicUrlSettings } from "./public-url";

describe("publicUrlSettings", () => {
  it("returns no settings when the env var is unset (dev: relative URLs, same-origin only)", () => {
    expect(publicUrlSettings(undefined)).toEqual({});
  });

  it("returns no settings for an empty string (unset repo variable renders '')", () => {
    expect(publicUrlSettings("")).toEqual({});
  });

  it("uses a single origin for serverURL, cors and csrf", () => {
    expect(publicUrlSettings("https://cms.testing.hbdragons.de")).toEqual({
      serverURL: "https://cms.testing.hbdragons.de",
      cors: ["https://cms.testing.hbdragons.de"],
      csrf: ["https://cms.testing.hbdragons.de"],
    });
  });

  it("takes the first of a comma-separated list as serverURL and trusts all of them", () => {
    const result = publicUrlSettings(
      "https://cms.testing.hbdragons.de, https://dragons-cms-production-123.europe-west3.run.app",
    );
    expect(result).toEqual({
      serverURL: "https://cms.testing.hbdragons.de",
      cors: [
        "https://cms.testing.hbdragons.de",
        "https://dragons-cms-production-123.europe-west3.run.app",
      ],
      csrf: [
        "https://cms.testing.hbdragons.de",
        "https://dragons-cms-production-123.europe-west3.run.app",
      ],
    });
  });

  it("normalizes entries to bare origins (trailing slashes and paths dropped)", () => {
    expect(publicUrlSettings("https://cms.testing.hbdragons.de/admin/")).toEqual({
      serverURL: "https://cms.testing.hbdragons.de",
      cors: ["https://cms.testing.hbdragons.de"],
      csrf: ["https://cms.testing.hbdragons.de"],
    });
  });

  it("ignores empty segments from stray commas", () => {
    expect(publicUrlSettings(",https://cms.testing.hbdragons.de,")).toEqual({
      serverURL: "https://cms.testing.hbdragons.de",
      cors: ["https://cms.testing.hbdragons.de"],
      csrf: ["https://cms.testing.hbdragons.de"],
    });
  });

  it("returns no settings for whitespace-only input", () => {
    expect(publicUrlSettings("  ,  ")).toEqual({});
  });

  it("throws on a value that is not a URL instead of booting with a broken origin", () => {
    expect(() => publicUrlSettings("not a url")).toThrow(/CMS_PUBLIC_URL/);
  });
});
