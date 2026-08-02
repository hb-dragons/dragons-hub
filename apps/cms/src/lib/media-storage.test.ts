import { describe, expect, it } from "vitest";

import { mediaStorageOptions } from "./media-storage";

describe("mediaStorageOptions", () => {
  it("serves media straight from GCS when the bucket is public", () => {
    expect(mediaStorageOptions("true")).toEqual({ disablePayloadAccessControl: true });
  });

  it("keeps media behind Payload when the bucket is private", () => {
    expect(mediaStorageOptions("false")).toBe(true);
  });

  it("treats an unset value as private", () => {
    expect(mediaStorageOptions(undefined)).toBe(true);
  });

  it("does not treat other truthy strings as public — the flag mirrors bucket IAM", () => {
    expect(mediaStorageOptions("1")).toBe(true);
    expect(mediaStorageOptions("TRUE")).toBe(true);
  });
});
