import type { CollectionConfig } from "payload";

import { seoFields } from "../fields/seo";
import { publishedOrAuthed } from "../lib/access";

export const Posts: CollectionConfig = {
  slug: "posts",
  versions: { drafts: true },
  access: { read: publishedOrAuthed },
  admin: { useAsTitle: "title" },
  fields: [
    { name: "title", type: "text", required: true },
    { name: "slug", type: "text", required: true, unique: true },
    { name: "publishedDate", type: "date", required: true },
    { name: "headerImage", type: "upload", relationTo: "media" },
    { name: "content", type: "richText" }, // Lexical
    { name: "gallery", type: "upload", relationTo: "media", hasMany: true },
    ...seoFields,
  ],
};
