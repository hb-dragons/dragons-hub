import type { CollectionConfig } from "payload";

import { dispatchOnDelete, dispatchOnPublish } from "../hooks/dispatch-rebuild";
import { publishedOrAuthed } from "../lib/access";

// Was Strapi `schiedsrichter` — the club's referees, rendered on the contact
// page. Like trainers, no admin.useAsTitle: a referee has no own name field
// (the name lives on the related person) and useAsTitle cannot follow a
// relationship.
export const Referees: CollectionConfig = {
  slug: "referees",
  versions: { drafts: true },
  access: { read: publishedOrAuthed },
  fields: [
    { name: "person", type: "relationship", relationTo: "people" },
    { name: "licence", type: "text" }, // was Strapi schiedsrichter.lizenz
    { name: "image", type: "upload", relationTo: "media" },
  ],
  hooks: { afterChange: [dispatchOnPublish], afterDelete: [dispatchOnDelete] },
};
