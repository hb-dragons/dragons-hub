import type { CollectionConfig } from "payload";

import { anyone } from "../lib/access";

export const Vorstand: CollectionConfig = {
  slug: "vorstand",
  access: { read: anyone },
  admin: { useAsTitle: "role" },
  fields: [
    { name: "role", type: "text", required: true }, // was Strapi vorstand.name (e.g. "1. Vorsitzende")
    { name: "tasks", type: "textarea" },
    { name: "person", type: "relationship", relationTo: "people" },
    { name: "orderIndex", type: "number", required: true },
    // Optional role-specific photo; the site falls back to person.image.
    { name: "image", type: "upload", relationTo: "media" },
  ],
};
