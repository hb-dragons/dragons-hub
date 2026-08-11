// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import useSWR from "swr";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useFormatter: () => ({ dateTime: (d: Date) => d.toISOString().slice(0, 10) }),
}));

vi.mock("@/lib/navigation", () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}));

vi.mock("@/lib/api", () => ({
  api: {
    notifications: {
      markRead: vi.fn(),
      markAllRead: vi.fn(),
      retry: vi.fn(),
    },
  },
}));

vi.mock("swr", async (importActual) => {
  const actual = await importActual<typeof import("swr")>();
  return {
    ...actual,
    default: vi.fn(actual.default),
    useSWRConfig: () => ({ mutate: vi.fn() }),
  };
});

import { NotificationCenter } from "./notification-center";

describe("<NotificationCenter>", () => {
  beforeEach(() => vi.mocked(useSWR).mockReset());
  afterEach(cleanup);

  it("renders an error state with retry instead of 'no notifications'", () => {
    const mutate = vi.fn();
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: new Error("down"),
      isLoading: false,
      mutate,
    } as never);

    render(<NotificationCenter />);
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    expect(screen.queryByText("empty")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /tryAgain/i })[0]!);
    expect(mutate).toHaveBeenCalled();
  });

  it("shows a loading affordance instead of the empty state while fetching", () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
    } as never);

    render(<NotificationCenter />);
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
    expect(screen.queryByText("empty")).not.toBeInTheDocument();
  });

  it("still shows the empty state when the inbox is genuinely empty", () => {
    vi.mocked(useSWR).mockReturnValue({
      data: { notifications: [], total: 0 },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    } as never);

    render(<NotificationCenter />);
    expect(screen.getAllByText("empty").length).toBeGreaterThan(0);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

/** The mocked translator returns the key, so a rendered key proves the lookup. */
function notification(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: "Kickoff moved",
    body: "…",
    createdAt: "2026-07-01T10:00:00.000Z",
    readAt: null,
    deepLinkPath: "/admin/matches/1",
    entityName: "Dragons vs Bears",
    entityType: "match",
    status: "sent",
    urgency: "immediate",
    ...overrides,
  };
}

describe("<NotificationCenter> enum labels", () => {
  beforeEach(() => vi.mocked(useSWR).mockReset());
  afterEach(cleanup);

  function renderWith(item: Record<string, unknown>) {
    vi.mocked(useSWR).mockReturnValue({
      data: { notifications: [item], total: 1 },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    } as never);
    render(<NotificationCenter />);
  }

  it("translates entityType, status and urgency instead of printing the raw enum", () => {
    renderWith(notification());
    expect(screen.getAllByText("entityTypes.match").length).toBeGreaterThan(0);
    expect(screen.getAllByText("statuses.sent").length).toBeGreaterThan(0);
    expect(screen.getAllByText("urgencies.immediate").length).toBeGreaterThan(0);
    // The bare token must not survive anywhere as its own badge.
    expect(screen.queryByText("match")).not.toBeInTheDocument();
  });

  it("falls back to a generic label for a value the catalog does not know", () => {
    renderWith(
      notification({ entityType: "wormhole", status: "quantum", urgency: "asap" }),
    );
    expect(screen.getAllByText("entityTypes.unknown").length).toBeGreaterThan(0);
    expect(screen.getAllByText("statuses.unknown").length).toBeGreaterThan(0);
    expect(screen.getAllByText("urgencies.unknown").length).toBeGreaterThan(0);
  });

  it("gives the pagination arrows accessible names", () => {
    renderWith(notification());
    expect(
      screen.getAllByRole("button", { name: "pagination.previous" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "pagination.next" }).length,
    ).toBeGreaterThan(0);
  });
});
