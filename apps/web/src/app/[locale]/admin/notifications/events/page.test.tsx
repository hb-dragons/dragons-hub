// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { isValidElement } from "react";
import useSWR from "swr";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((k: string) => k),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useFormatter: () => ({ dateTime: (d: Date) => d.toISOString().slice(0, 10) }),
}));

const getServerSessionMock = vi.fn();
vi.mock("@/lib/auth-server", () => ({
  getServerSession: () => getServerSessionMock(),
}));

const eventsList = vi.fn();
vi.mock("@/lib/api.server", () => ({
  getServerApi: () =>
    Promise.resolve({ events: { list: (...a: unknown[]) => eventsList(...a) } }),
}));

vi.mock("swr", async (importActual) => {
  const actual = await importActual<typeof import("swr")>();
  return { ...actual, default: vi.fn(actual.default) };
});

import EventsPage from "./page";
import { EventBrowser } from "@/components/admin/notifications/event-browser";

const SESSION = {
  user: { id: "u1", name: "N", email: "a@b.com", role: "admin", refereeId: null },
  session: { id: "s1", expiresAt: "" },
};

/** Walk the returned tree for the <SWRConfig> fallback map, if any. */
function findFallback(node: unknown): Record<string, unknown> | null {
  if (!isValidElement(node)) return null;
  const props = node.props as {
    value?: { fallback?: Record<string, unknown> };
    children?: unknown;
  };
  if (props.value?.fallback) return props.value.fallback;
  const children = Array.isArray(props.children) ? props.children : [props.children];
  for (const child of children) {
    const found = findFallback(child);
    if (found) return found;
  }
  return null;
}

describe("/admin/notifications/events prefetch", () => {
  beforeEach(() => {
    getServerSessionMock.mockReset().mockResolvedValue(SESSION);
    eventsList.mockReset().mockResolvedValue({ events: [], total: 0 });
    vi.mocked(useSWR).mockReset();
  });
  afterEach(cleanup);

  it("primes the exact key the event browser requests on first paint", async () => {
    const fallback = findFallback(await EventsPage());
    expect(fallback).not.toBeNull();

    let observed = "";
    vi.mocked(useSWR).mockImplementation((key: unknown) => {
      observed = key as string;
      return { data: undefined, isLoading: false, mutate: vi.fn() } as never;
    });
    render(<EventBrowser />);

    expect(Object.keys(fallback!)).toContain(observed);
  });
});

describe("/admin/notifications/events loading UI", () => {
  afterEach(cleanup);

  it("has a route-level loading fallback", async () => {
    const Loading = (await import("./loading")).default;
    render(<Loading />);
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  });
});
