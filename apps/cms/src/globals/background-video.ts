import type { GlobalConfig } from "payload";

import { dispatchGlobalOnChange } from "../hooks/dispatch-rebuild";
import { anyone } from "../lib/access";

// Dead feature on the legacy site, kept as a parked singleton per the plan.
export const BackgroundVideo: GlobalConfig = {
  slug: "background-video",
  access: { read: anyone },
  fields: [{ name: "video", type: "upload", relationTo: "media" }],
  hooks: { afterChange: [dispatchGlobalOnChange] },
};
