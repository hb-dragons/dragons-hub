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
