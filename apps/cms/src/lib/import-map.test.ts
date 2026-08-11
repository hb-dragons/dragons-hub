import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// `payload generate:importmap` only records components of plugins that were
// active when it ran, and the GCS storage plugin is gated on GCS_MEDIA_BUCKET
// (unset in dev). Generating without that var therefore produces a map that
// works locally and breaks production: the admin panel renders an empty page
// and logs "PayloadComponent not found in importMap". Regenerate with
// GCS_MEDIA_BUCKET set.
const importMapPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../app/(payload)/admin/importMap.js",
);

describe("generated admin importMap", () => {
  it("registers the GCS upload handler the prod media plugin needs", () => {
    const importMap = readFileSync(importMapPath, "utf8");

    expect(importMap).toContain("@payloadcms/storage-gcs/client#GcsClientUploadHandler");
  });
});
