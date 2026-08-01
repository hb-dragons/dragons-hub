import type { CollectionConfig } from "payload";

import { dispatchOnDelete, dispatchOnPublish } from "../hooks/dispatch-rebuild";
import { anyone } from "../lib/access";

export const Positions: CollectionConfig = {
  slug: "positions",
  access: { read: anyone },
  admin: { useAsTitle: "name" },
  fields: [
    { name: "name", type: "text", required: true },
    { name: "tasks", type: "textarea" },
    { name: "people", type: "relationship", relationTo: "people", hasMany: true },
    { name: "orderIndex", type: "number", required: true },
    { name: "email", type: "email" },
  ],
  hooks: { afterChange: [dispatchOnPublish], afterDelete: [dispatchOnDelete] },
};
