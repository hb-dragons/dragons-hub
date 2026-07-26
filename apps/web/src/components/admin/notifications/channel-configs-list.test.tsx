// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  create: vi.fn(),
  mutate: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

const swrData: Record<string, unknown> = {};

vi.mock("swr", () => ({
  default: (key: string | null) => ({ data: key ? swrData[key] : undefined }),
  useSWRConfig: () => ({ mutate: mocks.mutate }),
}));

vi.mock("@/lib/api", () => ({
  api: { channelConfigs: { update: mocks.update, create: mocks.create } },
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

import { ChannelConfigsList } from "./channel-configs-list";

const messages = {
  common: { cancel: "Cancel", save: "Save", failed: "Failed" },
  channelConfigs: {
    title: "Notification Channels",
    description: "Configure channels",
    empty: "No channels configured",
    create: "Create channel",
    edit: "Edit channel",
    saved: "Channel saved",
    name: "Name",
    type: "Type",
    enabled: "Enabled",
    disabled: "Disabled",
    digestMode: "Digest mode",
    digestCron: "Cron expression",
    digestTimezone: "Timezone",
    perSync: "After sync",
    scheduled: "Scheduled",
    none: "None",
    audienceRole: "Audience",
    audienceRoles: { admin: "Admins", referee: "Referees" },
    locale: "Language",
    locales: { de: "German", en: "English" },
    groupId: "WhatsApp Group ID",
    groupIdHelp: "Group chat ID",
    providerNotConfigured: "Provider not configured",
    typeLabels: {
      in_app: "In-App",
      whatsapp_group: "WhatsApp Group",
      email: "Email",
    },
    typeImmutable: "Type cannot be changed after a channel is created.",
  },
};

function wrap(ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

const inAppChannel = {
  id: 3,
  name: "Admin in-app",
  type: "in_app" as const,
  enabled: true,
  digestMode: "none" as const,
  digestCron: null,
  digestTimezone: "Europe/Berlin",
  config: { audienceRole: "admin" as const, locale: "de" as const },
};

describe("ChannelConfigsList type/config coupling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(swrData)) delete swrData[key];
    swrData["/admin/channel-configs"] = { configs: [inAppChannel] };
    swrData["/admin/channel-configs/providers"] = {
      in_app: { configured: true },
      whatsapp_group: { configured: true },
      email: { configured: true },
    };
    mocks.update.mockResolvedValue({});
    mocks.create.mockResolvedValue({});
  });
  afterEach(cleanup);

  function openEditDialog() {
    render(wrap(<ChannelConfigsList />));
    fireEvent.click(screen.getByRole("button", { name: "Edit channel" }));
  }

  it("does not let an existing channel's type be changed", () => {
    openEditDialog();
    // The update contract has no `type` field — the persisted type is
    // immutable, so offering an editable control writes a config shaped for a
    // type the server never stores.
    expect(screen.getByLabelText("Type")).toBeDisabled();
  });

  it("still offers a type choice when creating a channel", () => {
    render(wrap(<ChannelConfigsList />));
    fireEvent.click(screen.getByRole("button", { name: "Create channel" }));
    expect(screen.getByLabelText("Type")).toBeEnabled();
  });

  it("saves an edit with a config shaped for the persisted type", async () => {
    openEditDialog();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });

    expect(mocks.update).toHaveBeenCalledWith(3, {
      name: "Admin in-app",
      digestMode: "none",
      digestCron: null,
      digestTimezone: "Europe/Berlin",
      config: { audienceRole: "admin", locale: "de" },
    });
  });
});
