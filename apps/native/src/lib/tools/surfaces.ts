import type { SurfaceGroup } from "@dragons/shared";

export interface NativeSurface {
  id: string;
  group: SurfaceGroup;
  route: string;
  labelKey: string;
}

/** Surfaces that have a native screen. Add entries as tools are ported. */
export const NATIVE_SURFACES: Record<string, NativeSurface> = {
  boards: {
    id: "boards",
    group: "operations",
    route: "/admin/boards",
    labelKey: "tools.boards",
  },
};
