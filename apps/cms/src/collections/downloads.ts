import type { CollectionConfig } from "payload";

import { dispatchOnDelete, dispatchOnPublish } from "../hooks/dispatch-rebuild";
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
  hooks: { afterChange: [dispatchOnPublish], afterDelete: [dispatchOnDelete] },
};
