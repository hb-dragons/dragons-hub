import type { Field } from "payload";

// Appended to posts, pages, teams — per-doc SEO overrides the site's <Seo />
// layer (plan Task C8) consumes; absent values fall back to derived meta.
export const seoFields: Field[] = [
  {
    name: "seoDescription",
    type: "textarea",
    admin: {
      description: "Überschreibt die automatisch erzeugte Meta-Description",
    },
  },
  { name: "ogImage", type: "upload", relationTo: "media" },
];
