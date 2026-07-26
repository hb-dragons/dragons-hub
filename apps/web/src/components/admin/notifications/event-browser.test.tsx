// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const swrKeys: unknown[] = [];
vi.mock("swr", () => ({
  default: (key: unknown) => {
    swrKeys.push(key);
    return { data: { events: [], total: 0 }, isLoading: false, mutate: vi.fn() };
  },
}));
vi.mock("@/lib/api", () => ({ api: { events: { trigger: vi.fn() } } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { EventBrowser } from "./event-browser";

const messages = {
  domainEvents: {
    empty: "No events",
    trigger: "Trigger",
    triggerSuccess: "ok",
    triggerFailed: "fail",
    columns: {
      type: "Type",
      entity: "Entity",
      source: "Source",
      urgency: "Urgency",
      date: "Date",
      actor: "Actor",
    },
    sourceLabels: {
      sync: "Sync",
      manual: "Manual",
      reconciliation: "Reconciliation",
    },
  },
};

function renderBrowser() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EventBrowser />
    </NextIntlClientProvider>,
  );
}

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
