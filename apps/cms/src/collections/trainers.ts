import type { CollectionConfig } from "payload";

import { anyone } from "../lib/access";

// No admin.useAsTitle: a trainer has no own name field — the name lives on the
// related person doc, and useAsTitle cannot follow a relationship.
export const Trainers: CollectionConfig = {
  slug: "trainers",
  access: { read: anyone },
  fields: [
    { name: "person", type: "relationship", relationTo: "people" },
    { name: "licence", type: "text" }, // was Strapi trainer.lizenz
    { name: "email", type: "email" },
    // Optional trainer-specific photo; the site falls back to person.image.
    { name: "image", type: "upload", relationTo: "media" },
  ],
};
