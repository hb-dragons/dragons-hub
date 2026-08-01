import type { GlobalConfig } from "payload";

import { anyone } from "../lib/access";

export const TeamBackground: GlobalConfig = {
  slug: "team-background",
  access: { read: anyone },
  fields: [{ name: "image", type: "upload", relationTo: "media" }],
};
