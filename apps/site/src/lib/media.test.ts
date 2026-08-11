import { afterEach, describe, expect, it } from "vitest";

import { cmsBaseUrl, mediaUrl } from "./media";

// Vitest's vite config exposes no CMS_URL on import.meta.env, so cmsBaseUrl()
// reads process.env here.
const originalCmsUrl = process.env.CMS_URL;

afterEach(() => {
  if (originalCmsUrl === undefined) delete process.env.CMS_URL;
  else process.env.CMS_URL = originalCmsUrl;
});

describe("cmsBaseUrl", () => {
  it("returns the configured CMS_URL", () => {
    process.env.CMS_URL = "http://localhost:3011";
    expect(cmsBaseUrl()).toBe("http://localhost:3011");
  });

  it("is undefined when CMS_URL is unset", () => {
    delete process.env.CMS_URL;
    expect(cmsBaseUrl()).toBeUndefined();
  });

  it("treats a blank CMS_URL as unset (mirrors the loaders' readEnv)", () => {
    process.env.CMS_URL = "";
    expect(cmsBaseUrl()).toBeUndefined();
  });
});

describe("mediaUrl", () => {
  it("returns null for null and undefined", () => {
    expect(mediaUrl(null, "http://localhost:3011")).toBeNull();
    expect(mediaUrl(undefined, "http://localhost:3011")).toBeNull();
  });

  it("returns absolute URLs unchanged (GCS-hosted prod media)", () => {
    const abs = "https://storage.googleapis.com/bucket/img.webp";
    expect(mediaUrl(abs, "http://localhost:3011")).toBe(abs);
    expect(mediaUrl("http://cdn.example/img.webp", "http://localhost:3011")).toBe(
      "http://cdn.example/img.webp",
    );
  });

  it("prefixes CMS-relative URLs with the base", () => {
    expect(mediaUrl("/api/media/file/x.webp", "http://localhost:3011")).toBe(
      "http://localhost:3011/api/media/file/x.webp",
    );
  });

  it("does not double the slash when the base has a trailing one", () => {
    expect(mediaUrl("/api/media/file/x.webp", "http://localhost:3011/")).toBe(
      "http://localhost:3011/api/media/file/x.webp",
    );
  });

  it("returns relative URLs as-is when no base is configured", () => {
    expect(mediaUrl("/api/media/file/x.webp", undefined)).toBe("/api/media/file/x.webp");
  });
});
