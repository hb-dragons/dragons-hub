import type { GlobalConfig } from "payload";

import { dispatchGlobalOnChange } from "../hooks/dispatch-rebuild";
import { anyone } from "../lib/access";

export const TeamBackground: GlobalConfig = {
  slug: "team-background",
  access: { read: anyone },
  fields: [{ name: "image", type: "upload", relationTo: "media" }],
  hooks: { afterChange: [dispatchGlobalOnChange] },
};
