import { vi } from "vitest";

// expo-router is a singleton imported at module load by several lib files.
vi.mock("expo-router", () => ({
  router: { replace: vi.fn(), push: vi.fn(), back: vi.fn() },
}));
