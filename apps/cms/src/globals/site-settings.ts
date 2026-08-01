import type { GlobalConfig } from "payload";

import { anyone } from "../lib/access";

// Club age is computed at build time from foundingYear; teamCount comes from
// /public/home/dashboard, deliberately not stored here.
export const SiteSettings: GlobalConfig = {
  slug: "site-settings",
  access: { read: anyone },
  fields: [
    { name: "memberCount", type: "number" },
    { name: "foundingYear", type: "number" },
  ],
};
