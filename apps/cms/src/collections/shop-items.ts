import type { CollectionConfig } from "payload";

import { dispatchOnDelete, dispatchOnPublish } from "../hooks/dispatch-rebuild";
import { publishedOrAuthed } from "../lib/access";

export const ShopItems: CollectionConfig = {
  slug: "shop-items",
  versions: { drafts: true },
  access: { read: publishedOrAuthed },
  admin: { useAsTitle: "name" },
  fields: [
    { name: "name", type: "text", required: true },
    // Strapi shop-item.images is an array; the site renders the first.
    { name: "images", type: "upload", relationTo: "media", hasMany: true },
    // Number, not text: Strapi stores 38.34 numerically and the site formats it.
    { name: "price", type: "number" },
    { name: "link", type: "text" },
    { name: "description", type: "textarea" },
  ],
  hooks: { afterChange: [dispatchOnPublish], afterDelete: [dispatchOnDelete] },
};
