// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import useSWR from "swr";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useFormatter: () => ({ dateTime: (d: Date) => d.toISOString().slice(0, 10) }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: "me" } } }),
    admin: { listUsers: vi.fn() },
  },
}));

vi.mock("swr", async (importActual) => {
  const actual = await importActual<typeof import("swr")>();
  return { ...actual, default: vi.fn(actual.default) };
});

import { UserListTable } from "./user-list-table";

describe("<UserListTable>", () => {
  beforeEach(() => vi.mocked(useSWR).mockReset());
  afterEach(cleanup);

  it("distinguishes a load failure from an empty user list and offers retry", () => {
    const mutate = vi.fn();
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: new Error("down"),
      isLoading: false,
      mutate,
    } as never);

    render(<UserListTable />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    // The old error branch reused the "no users found" copy, which reads as an
    // empty state rather than a failure.
    expect(screen.queryByText("empty")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /tryAgain/i }));
    expect(mutate).toHaveBeenCalled();
  });

  it("shows a loading affordance while fetching", () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
    } as never);

    render(<UserListTable />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
