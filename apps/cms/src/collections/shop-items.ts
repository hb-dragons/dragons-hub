import type { CollectionConfig } from "payload";

import { anyone } from "../lib/access";

export const ShopItems: CollectionConfig = {
  slug: "shop-items",
  access: { read: anyone },
  admin: { useAsTitle: "name" },
  fields: [
    { name: "name", type: "text", required: true },
    { name: "image", type: "upload", relationTo: "media" },
    { name: "price", type: "text" },
    { name: "link", type: "text" },
    { name: "description", type: "textarea" },
  ],
};
