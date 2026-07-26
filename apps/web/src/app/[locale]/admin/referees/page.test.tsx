// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import useSWR from "swr";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  useSearchParams: () => new URLSearchParams(""),
}));

const getServerSessionMock = vi.fn();
vi.mock("@/lib/auth-server", () => ({
  getServerSession: () => getServerSessionMock(),
}));

const listReferees = vi.fn();
const getGames = vi.fn();
vi.mock("@/lib/api.server", () => ({
  getServerApi: () =>
    Promise.resolve({
      refereeAdmin: { listReferees: (...a: unknown[]) => listReferees(...a) },
      referees: { getGames: (...a: unknown[]) => getGames(...a) },
    }),
}));

vi.mock("@/components/admin/referee-hub/referee-hub", () => ({
  RefereeHubPage: () => null,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useFormatter: () => ({ dateTime: (d: Date) => d.toISOString().slice(0, 10) }),
}));

vi.mock("swr", async (importActual) => {
  const actual = await importActual<typeof import("swr")>();
  return { ...actual, default: vi.fn(actual.default) };
});

import RefereesPage from "./page";
import { OpenGamesList } from "@/components/admin/referee-hub/open-slots/open-games-list";

const SESSION = {
  user: { id: "u1", name: "N", email: "a@b.com", role: "admin", refereeId: null },
  session: { id: "s1", expiresAt: "" },
};

/** Pull the SWR fallback map out of the <SWRConfig> the page returns. */
async function renderPageFallback(): Promise<Record<string, unknown>> {
  const element = (await RefereesPage()) as {
    props: { value: { fallback: Record<string, unknown> } };
  };
  return element.props.value.fallback;
}

describe("/admin/referees prefetch", () => {
  beforeEach(() => {
    getServerSessionMock.mockReset().mockResolvedValue(SESSION);
    listReferees.mockReset().mockResolvedValue({ items: [], total: 0 });
    getGames.mockReset().mockResolvedValue({ items: [], total: 0 });
    vi.mocked(useSWR).mockReset();
  });
  afterEach(cleanup);

  it("primes the exact key the open-games list requests on first paint", async () => {
    const fallback = await renderPageFallback();

    let observed = "";
    vi.mocked(useSWR).mockImplementation((key: unknown) => {
      observed = key as string;
      return { data: { items: [] } } as never;
    });
    render(
      <OpenGamesList
        filters={{
          status: "open",
          league: [],
          dateFrom: null,
          dateTo: null,
          gameType: "both",
        }}
        selectedGameId={null}
        onSelect={() => {}}
      />,
    );

    expect(Object.keys(fallback)).toContain(observed);
  });

  it("runs the two independent prefetches concurrently, not one after the other", async () => {
    const order: string[] = [];
    listReferees.mockImplementation(async () => {
      order.push("referees:start");
      await new Promise((r) => setTimeout(r, 0));
      order.push("referees:end");
      return { items: [], total: 0 };
    });
    getGames.mockImplementation(async () => {
      order.push("games:start");
      await new Promise((r) => setTimeout(r, 0));
      order.push("games:end");
      return { items: [], total: 0 };
    });

    await renderPageFallback();

    // Sequential awaits would produce referees:start, referees:end, games:start…
    expect(order.slice(0, 2)).toEqual(["referees:start", "games:start"]);
  });

  it("omits a failed prefetch rather than hydrating undefined as data", async () => {
    getGames.mockRejectedValue(new Error("down"));
    const fallback = await renderPageFallback();
    expect(Object.values(fallback).every((v) => v !== undefined)).toBe(true);
    expect(Object.keys(fallback)).toHaveLength(1);
  });
});

describe("/admin/referees loading UI", () => {
  afterEach(cleanup);

  it("has a route-level loading fallback", async () => {
    const Loading = (await import("./loading")).default;
    render(<Loading />);
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  });
});
