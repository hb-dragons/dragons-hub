import type { CollectionConfig } from "payload";

import { seoFields } from "../fields/seo";
import { dispatchOnDelete, dispatchOnPublish } from "../hooks/dispatch-rebuild";
import { publishedOrAuthed } from "../lib/access";

export const Pages: CollectionConfig = {
  slug: "pages",
  versions: { drafts: true },
  access: { read: publishedOrAuthed },
  admin: { useAsTitle: "slug" },
  fields: [
    { name: "slug", type: "text", required: true, unique: true },
    {
      name: "header",
      type: "group",
      fields: [
        { name: "title", type: "text" },
        { name: "image", type: "upload", relationTo: "media" },
      ],
    },
    {
      name: "layout",
      type: "blocks",
      blocks: [
        // 1:1 with the Strapi dynamic zone (team.team / contact.contact / news.news / download.download)
        {
          slug: "teamList",
          fields: [
            { name: "teams", type: "relationship", relationTo: "teams", hasMany: true },
          ],
        },
        {
          slug: "contact",
          fields: [
            { name: "vorstand", type: "relationship", relationTo: "vorstand", hasMany: true },
            { name: "positions", type: "relationship", relationTo: "positions", hasMany: true },
          ],
        },
        {
          slug: "newsList",
          fields: [
            { name: "posts", type: "relationship", relationTo: "posts", hasMany: true },
          ],
        },
        {
          slug: "downloadList",
          fields: [
            { name: "downloads", type: "relationship", relationTo: "downloads", hasMany: true },
          ],
        },
      ],
    },
    ...seoFields,
  ],
  hooks: { afterChange: [dispatchOnPublish], afterDelete: [dispatchOnDelete] },
};
