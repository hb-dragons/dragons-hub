// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
}));

import AdminDashboardLoading from "./loading";
import SyncLoading from "./sync/loading";

afterEach(cleanup);

// The slowest admin routes block on server fetches before they can paint. Each
// needs a route-level loading.tsx or Next renders nothing until the data lands.
describe.each([
  ["/admin", AdminDashboardLoading],
  ["/admin/sync", SyncLoading],
])("%s route-level loading UI", (_route, Loading) => {
  it("renders a busy status region", () => {
    render(<Loading />);
    const statuses = screen.getAllByRole("status");
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses[0]).toHaveAttribute("aria-busy", "true");
  });
});
