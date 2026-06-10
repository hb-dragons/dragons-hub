import type { SurfaceGroup } from "@dragons/shared";

export interface NativeSurface {
  id: string;
  group: SurfaceGroup;
  route: string;
  labelKey: string;
  sf: string;
}

/** Surfaces that have a native screen. Add entries as tools are ported. */
export const NATIVE_SURFACES: Record<string, NativeSurface> = {
  officiating: {
    id: "officiating",
    group: "league",
    route: "/officiating",
    labelKey: "tools.officiating",
    sf: "whistle",
  },
  boards: {
    id: "boards",
    group: "operations",
    route: "/admin/boards",
    labelKey: "tools.boards",
    sf: "square.stack.3d.up",
  },
};
