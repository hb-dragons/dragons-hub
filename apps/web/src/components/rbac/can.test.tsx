import { describe, it, expect, vi, beforeEach } from "vitest";
import { isValidElement } from "react";

// Mock the auth client that <Can> depends on. We vary the session per test.
const useSessionMock = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => useSessionMock(),
  },
}));

import { Can } from "./can";

// <Can> renders a Fragment whose `children` prop is EITHER the `children` prop
// OR the `fallback` prop, depending on the permission check. We don't need a
// DOM renderer — we can walk the returned element's props directly.
//
// Return signature: `<>{children}</>` or `<>{fallback}</>`, where the Fragment
// wraps the resolved branch. React.isValidElement + props.children is enough
// to assert which branch was taken.
function resolveFragment(node: unknown): unknown {
  if (!isValidElement(node)) return node;
  // Fragment: { type: Symbol(react.fragment), props: { children: <resolved> } }
  const props = node.props as { children?: unknown };
  return props.children;
}

describe("<Can>", () => {
  beforeEach(() => {
    useSessionMock.mockReset();
  });

  it("renders children when user has permission", () => {
    useSessionMock.mockReturnValue({ data: { user: { role: "admin" } } });
    const allowed = <span data-testid="allowed">yes</span>;
    const result = Can({
      resource: "venue",
      action: "create",
      children: allowed,
    });
    expect(resolveFragment(result)).toBe(allowed);
  });

  it("renders fallback when user lacks permission", () => {
    useSessionMock.mockReturnValue({ data: { user: { role: "teamManager" } } });
    const allowed = <span>yes</span>;
    const denied = <span>no</span>;
    const result = Can({
      resource: "venue",
      action: "create",
      children: allowed,
      fallback: denied,
    });
    expect(resolveFragment(result)).toBe(denied);
  });

  it("renders fallback when not logged in (no session)", () => {
    useSessionMock.mockReturnValue({ data: null });
    const allowed = <span>yes</span>;
    const denied = <span>anon</span>;
    const result = Can({
      resource: "venue",
      action: "create",
      children: allowed,
      fallback: denied,
    });
    expect(resolveFragment(result)).toBe(denied);
  });

  it("renders null fallback by default when not logged in", () => {
    useSessionMock.mockReturnValue({ data: null });
    const result = Can({
      resource: "venue",
      action: "create",
      children: <span>yes</span>,
    });
    expect(resolveFragment(result)).toBeNull();
  });

  it("unions permissions across multi-role users", () => {
    useSessionMock.mockReturnValue({
      data: { user: { role: "teamManager,venueManager" } },
    });
    const allowed = <span>yes</span>;
    // venueManager has venue:create (teamManager alone does not).
    const result = Can({
      resource: "venue",
      action: "create",
      children: allowed,
    });
    expect(resolveFragment(result)).toBe(allowed);
  });

  it("denies when user has a role but not the required permission", () => {
    useSessionMock.mockReturnValue({ data: { user: { role: "teamManager" } } });
    const denied = <span>no</span>;
    // teamManager cannot create bookings.
    const result = Can({
      resource: "booking",
      action: "create",
      children: <span>yes</span>,
      fallback: denied,
    });
    expect(resolveFragment(result)).toBe(denied);
  });

  it("denies when role is null (post-migration default for new signups)", () => {
    useSessionMock.mockReturnValue({ data: { user: { role: null } } });
    const denied = <span>no</span>;
    const result = Can({
      resource: "venue",
      action: "view",
      children: <span>yes</span>,
      fallback: denied,
    });
    expect(resolveFragment(result)).toBe(denied);
  });
});
