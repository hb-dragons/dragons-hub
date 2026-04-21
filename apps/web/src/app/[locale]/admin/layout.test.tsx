import { describe, it, expect, vi, beforeEach } from "vitest";
import { isValidElement } from "react";

// `redirect` from next/navigation throws a special error in a real Next runtime
// to unwind the render tree. Our stub throws a marker Error so we can assert
// the layout called it with the right path.
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

const getServerSessionMock = vi.fn();
vi.mock("@/lib/auth-server", () => ({
  getServerSession: () => getServerSessionMock(),
}));

// The layout also imports the sidebar + breadcrumb components. For a server-
// render-only test we don't need their real implementations; stub to minimal
// components so the returned tree is inspectable.
vi.mock("@dragons/ui/components/sidebar", () => ({
  SidebarProvider: ({ children }: { children: unknown }) => children,
  SidebarInset: ({ children }: { children: unknown }) => children,
  SidebarTrigger: () => null,
}));
vi.mock("@dragons/ui/components/tooltip", () => ({
  TooltipProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/components/admin/app-sidebar", () => ({
  AppSidebar: () => null,
}));
vi.mock("@/components/admin/admin-breadcrumb", () => ({
  AdminBreadcrumb: () => null,
}));

import AdminLayout from "./layout";

describe("<AdminLayout> guard", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    getServerSessionMock.mockReset();
  });

  it("redirects unauthenticated visitors to /auth/sign-in", async () => {
    getServerSessionMock.mockResolvedValue(null);
    await expect(
      AdminLayout({ children: null }),
    ).rejects.toThrow("REDIRECT:/auth/sign-in");
    expect(redirectMock).toHaveBeenCalledWith("/auth/sign-in");
  });

  it("redirects users with no roles (role = null) to /", async () => {
    getServerSessionMock.mockResolvedValue({
      user: { id: "u1", name: "N", email: "a@b.com", role: null, refereeId: null },
      session: { id: "s1", expiresAt: new Date().toISOString() },
    });
    await expect(AdminLayout({ children: null })).rejects.toThrow("REDIRECT:/");
    expect(redirectMock).toHaveBeenCalledWith("/");
  });

  it("redirects users with only unknown role strings to /", async () => {
    getServerSessionMock.mockResolvedValue({
      user: {
        id: "u2",
        name: "N",
        email: "a@b.com",
        // Unknown strings are filtered by parseRoles -> empty -> redirect.
        role: "user",
        refereeId: null,
      },
      session: { id: "s1", expiresAt: new Date().toISOString() },
    });
    await expect(AdminLayout({ children: null })).rejects.toThrow("REDIRECT:/");
  });

  it("renders children for users with at least one known role", async () => {
    getServerSessionMock.mockResolvedValue({
      user: {
        id: "u3",
        name: "N",
        email: "a@b.com",
        role: "admin",
        refereeId: null,
      },
      session: { id: "s1", expiresAt: new Date().toISOString() },
    });
    const result = await AdminLayout({ children: "hello" });
    expect(redirectMock).not.toHaveBeenCalled();
    expect(isValidElement(result)).toBe(true);
  });

  it("renders children for multi-role users (e.g., venueManager only)", async () => {
    getServerSessionMock.mockResolvedValue({
      user: {
        id: "u4",
        name: "N",
        email: "a@b.com",
        role: "venueManager",
        refereeId: null,
      },
      session: { id: "s1", expiresAt: new Date().toISOString() },
    });
    const result = await AdminLayout({ children: "hello" });
    expect(redirectMock).not.toHaveBeenCalled();
    expect(isValidElement(result)).toBe(true);
  });
});
