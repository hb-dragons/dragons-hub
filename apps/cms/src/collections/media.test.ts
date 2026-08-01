import { isBlurhashValid } from "blurhash";
import { describe, expect, it } from "vitest";

import { ONE_BY_ONE_PNG } from "../lib/test-fixtures";
import { Media } from "./media";

const beforeChange = Media.hooks!.beforeChange![0]!;

type HookArgs = Parameters<typeof beforeChange>[0];

function runHook(file: { mimetype: string; data: Buffer } | undefined) {
  const data: Record<string, unknown> = { alt: "existing" };
  return beforeChange({ data, req: { file } } as unknown as HookArgs);
}

const read = Media.access!.read!;

describe("media access", () => {
  it("grants anonymous read", () => {
    expect(read({} as Parameters<typeof read>[0])).toBe(true);
  });
});

describe("media beforeChange hook", () => {
  it("populates blurhash for an image upload", async () => {
    const data = await runHook({ mimetype: "image/png", data: ONE_BY_ONE_PNG });
    expect(isBlurhashValid(data.blurhash as string).result).toBe(true);
  });

  it("leaves non-image uploads untouched", async () => {
    const data = await runHook({
      mimetype: "application/pdf",
      data: Buffer.from("%PDF-1.4"),
    });
    expect(data.blurhash).toBeUndefined();
  });

  it("skips when no file is attached (metadata-only update)", async () => {
    const data = await runHook(undefined);
    expect(data.blurhash).toBeUndefined();
    expect(data.alt).toBe("existing");
  });

  it("is non-fatal when the image cannot be decoded", async () => {
    const data = await runHook({
      mimetype: "image/png",
      data: Buffer.from("not really a png"),
    });
    expect(data.blurhash).toBeUndefined();
  });
});
