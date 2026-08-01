import type { CollectionConfig } from "payload";

import { anyone } from "../lib/access";

// Was Strapi `ehrenamtliche` — the shared person pool vorstand, positions and
// trainers reference.
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
};
