// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import useSWR from "swr";
import enMessages from "@/messages/en.json";
import deMessages from "@/messages/de.json";

const swrKeys: unknown[] = [];
vi.mock("swr", async (importActual) => {
  const actual = await importActual<typeof import("swr")>();
  return { ...actual, default: vi.fn(actual.default) };
});
vi.mock("@/lib/api", () => ({ api: { events: { trigger: vi.fn() } } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { EventBrowser } from "./event-browser";
import type { DomainEventItem } from "./types";

// The full real catalogs, not a hand-rolled subset — a fixture that only
// lists the keys a test author remembered to add can't catch a key the
// component forgot to look up in the first place.
function renderBrowser(events: DomainEventItem[] = [], total = 0, locale: "en" | "de" = "en") {
  vi.mocked(useSWR).mockImplementation((key: unknown) => {
    swrKeys.push(key);
    return { data: { events, total }, isLoading: false, mutate: vi.fn() } as never;
  });
  const messages = locale === "en" ? enMessages : deMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <EventBrowser />
    </NextIntlClientProvider>,
  );
}

const baseEvent: DomainEventItem = {
  id: "evt_1",
  type: "match.time_changed",
  source: "sync",
  urgency: "immediate",
  occurredAt: "2026-05-01T10:00:00.000Z",
  actor: null,
  syncRunId: 42,
  entityType: "match",
  entityId: 7,
  entityName: "Dragons vs. Tigers",
  deepLinkPath: "/admin/matches/7",
  enqueuedAt: "2026-05-01T10:01:00.000Z",
  payload: {},
  createdAt: "2026-05-01T10:00:00.000Z",
};

function lastKey() {
  return String(swrKeys[swrKeys.length - 1]);
}

/** Drives a Radix Select purely by keyboard: open, walk to the option, pick. */
async function pickOption(trigger: HTMLElement, label: string) {
  fireEvent.keyDown(trigger, { key: "Enter", code: "Enter" });
  const option = await screen.findByRole("option", { name: label });
  fireEvent.keyDown(option, { key: "Enter", code: "Enter" });
}

describe("EventBrowser entity-type filter", () => {
  beforeEach(() => {
    swrKeys.length = 0;
  });
  afterEach(cleanup);

  it("omits entityType from the query while no entity filter is chosen", () => {
    renderBrowser();
    expect(lastKey()).not.toContain("entityType");
  });

  it("filters by the chosen entity type", async () => {
    renderBrowser();
    const [entityTrigger] = screen.getAllByRole("combobox");
    await pickOption(entityTrigger!, "match");
    await waitFor(() => expect(lastKey()).toContain("entityType=match"));
  });

  it("clears the filter when All is chosen instead of sending entityType=all", async () => {
    renderBrowser();
    const [entityTrigger] = screen.getAllByRole("combobox");

    await pickOption(entityTrigger!, "match");
    await waitFor(() => expect(lastKey()).toContain("entityType=match"));

    await pickOption(entityTrigger!, "All");
    // `entityType=all` is accepted by the contract as a free string and matches
    // zero rows, permanently emptying the table with no way back.
    await waitFor(() => expect(lastKey()).not.toContain("entityType"));
  });

  it("clears the source filter when All is chosen", async () => {
    renderBrowser();
    const sourceTrigger = screen.getAllByRole("combobox")[1];

    await pickOption(sourceTrigger!, "Sync");
    await waitFor(() => expect(lastKey()).toContain("source=sync"));

    await pickOption(sourceTrigger!, "All");
    await waitFor(() => expect(lastKey()).not.toContain("source="));
  });
});

describe("EventBrowser i18n and a11y", () => {
  beforeEach(() => {
    swrKeys.length = 0;
  });
  afterEach(cleanup);

  it("pluralises the event count via real ICU, not a JS ternary", () => {
    const { unmount } = renderBrowser([baseEvent], 1);
    expect(screen.getByText("1 event")).toBeInTheDocument();
    unmount();

    renderBrowser([baseEvent, { ...baseEvent, id: "evt_2" }], 2);
    expect(screen.getByText("2 events")).toBeInTheDocument();
  });

  it("pluralises correctly in German too, proving it's catalog-driven rather than English-only", () => {
    renderBrowser([baseEvent], 1, "de");
    // A component that still hand-rolls `${total} event${total===1?"":"s"}"`
    // would leak that English suffix into every locale.
    expect(screen.queryByText(/^\d+ events?$/)).not.toBeInTheDocument();
  });

  it("renders the entityType and urgency enum values through the catalog, not raw", () => {
    renderBrowser([baseEvent], 1);
    expect(screen.getByText(enMessages.domainEvents.urgencyLabels.immediate)).toBeInTheDocument();
  });

  it("maps enum values differently per locale (proof they're not literal strings)", () => {
    renderBrowser([baseEvent], 1, "de");
    expect(screen.getByText(deMessages.domainEvents.urgencyLabels.immediate)).toBeInTheDocument();
    expect(deMessages.domainEvents.urgencyLabels.immediate).not.toBe(
      enMessages.domainEvents.urgencyLabels.immediate,
    );
  });

  it("renders the pagination and search chrome in German, proving it isn't hardcoded English", () => {
    renderBrowser([], 0, "de");
    // These would only appear if the component still hand-typed the English
    // strings instead of asking the active-locale catalog for them.
    expect(screen.queryByText("Rows per page")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Page \d+ of \d+$/)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search...")).not.toBeInTheDocument();
    expect(screen.getByText(deMessages.domainEvents.rowsPerPage)).toBeInTheDocument();
  });

  it("gives every pagination icon button an accessible name", () => {
    renderBrowser([baseEvent], 1);
    for (const name of [
      enMessages.domainEvents.pagination.first,
      enMessages.domainEvents.pagination.previous,
      enMessages.domainEvents.pagination.next,
      enMessages.domainEvents.pagination.last,
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("exposes each event row as a keyboard-operable disclosure control", () => {
    renderBrowser([baseEvent], 1);
    const row = screen.getByRole("button", { name: /dragons vs\. tigers/i });
    expect(row).toHaveAttribute("tabindex", "0");
    expect(row).toHaveAttribute("aria-expanded", "false");

    fireEvent.keyDown(row, { key: "Enter" });
    expect(row).toHaveAttribute("aria-expanded", "true");
  });

  it("renders the expanded detail panel labels through the catalog", () => {
    renderBrowser([baseEvent], 1);
    const row = screen.getByRole("button", { name: /dragons vs\. tigers/i });
    fireEvent.click(row);

    expect(screen.getByText(enMessages.domainEvents.deepLink, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(enMessages.domainEvents.syncRun, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(enMessages.domainEvents.enqueued, { exact: false })).toBeInTheDocument();
  });
});
