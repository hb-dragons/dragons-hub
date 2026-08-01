import type { CollectionConfig } from "payload";

import { encodeBlurhash } from "../lib/blurhash";

// Every image-bearing collection relates to this one; the site's BlurImage
// component consumes `blurhash`. Storage is local disk in dev, GCS in prod
// (plugin gated on GCS_MEDIA_BUCKET in payload.config.ts).
export const Media: CollectionConfig = {
  slug: "media",
  upload: { mimeTypes: ["image/*", "video/*", "application/pdf"] },
  access: { read: () => true },
  fields: [
    { name: "alt", type: "text" },
    { name: "blurhash", type: "text", admin: { readOnly: true } },
  ],
  hooks: {
    beforeChange: [
      async ({ data, req }) => {
        const file = req.file;
        if (file?.mimetype?.startsWith("image/")) {
          try {
            data.blurhash = await encodeBlurhash(file.data);
          } catch {
            // Non-fatal: an image sharp can't decode still uploads, just without a blurhash.
          }
        }
        return data;
      },
    ],
  },
};
