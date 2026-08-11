import type { CollectionConfig } from "payload";

import { dispatchOnDelete, dispatchOnPublish } from "../hooks/dispatch-rebuild";
import { publishedOrAuthed } from "../lib/access";

export const Partners: CollectionConfig = {
  slug: "partners",
  versions: { drafts: true },
  access: { read: publishedOrAuthed },
  admin: { useAsTitle: "name" },
  fields: [
    { name: "name", type: "text", required: true },
    // Strapi partner.beschreibung — long prose the legacy supporter page shows.
    { name: "description", type: "textarea" },
    { name: "logo", type: "upload", relationTo: "media" },
    { name: "url", type: "text" },
    // Optional (unlike teams/vorstand/positions): new in Payload — legacy
    // Strapi partners carry no order value for the migration to backfill.
    { name: "orderIndex", type: "number" },
  ],
  hooks: { afterChange: [dispatchOnPublish], afterDelete: [dispatchOnDelete] },
};
