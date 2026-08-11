import type { SurfaceGroup } from "@dragons/shared";
import type { RouteHref } from "@/lib/nav/href";

export interface NativeSurface {
  id: string;
  group: SurfaceGroup;
  /** Typed href: a surface pointing at a screen the app lacks fails typecheck. */
  route: RouteHref;
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
