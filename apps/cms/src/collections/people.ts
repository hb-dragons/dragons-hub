import type { CollectionConfig } from "payload";

import { dispatchOnDelete, dispatchOnPublish } from "../hooks/dispatch-rebuild";
import { anyone } from "../lib/access";

// Was Strapi `ehrenamtliche` — the shared person pool vorstand and positions
// reference. (Trainers moved to the Hub's `team_staff`, ADR-0008.)
export const People: CollectionConfig = {
  slug: "people",
  access: { read: anyone },
  admin: { useAsTitle: "name" },
  fields: [
    { name: "name", type: "text", required: true },
    { name: "email", type: "email" },
    { name: "phone", type: "text" },
    { name: "image", type: "upload", relationTo: "media" },
  ],
  hooks: { afterChange: [dispatchOnPublish], afterDelete: [dispatchOnDelete] },
};
