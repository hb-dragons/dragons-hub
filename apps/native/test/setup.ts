import { vi } from "vitest";

// expo-router is a singleton imported at module load by several lib files.
//
// This factory *replaces* the module, so `router` is the only export any test
// can see. Since the SDK 56 router codemod (#213) more of the app's navigation
// surface comes from expo-router — theming, `useFocusEffect` — so a test that
// reaches a module using one of those will read `undefined` and fail here
// rather than where it looks. Add the export to this factory when that happens.
vi.mock("expo-router", () => ({
  router: { replace: vi.fn(), push: vi.fn(), back: vi.fn() },
}));
