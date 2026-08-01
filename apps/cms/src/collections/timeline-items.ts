import type { CollectionConfig } from "payload";

import { dispatchOnDelete, dispatchOnPublish } from "../hooks/dispatch-rebuild";
import { anyone } from "../lib/access";

export const TimelineItems: CollectionConfig = {
  slug: "timeline-items",
  access: { read: anyone },
  admin: { useAsTitle: "title" },
  fields: [
    { name: "year", type: "text" },
    { name: "title", type: "text", required: true },
    { name: "description", type: "textarea" },
    { name: "image", type: "upload", relationTo: "media" },
  ],
  hooks: { afterChange: [dispatchOnPublish], afterDelete: [dispatchOnDelete] },
};
