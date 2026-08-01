import type { CollectionConfig } from "payload";

import { anyone } from "../lib/access";

export const Downloads: CollectionConfig = {
  slug: "downloads",
  access: { read: anyone },
  admin: { useAsTitle: "title" },
  fields: [
    { name: "title", type: "text", required: true },
    { name: "file", type: "upload", relationTo: "media" },
    { name: "category", type: "text" },
  ],
};
