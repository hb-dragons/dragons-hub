// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "disableIframePageLoading": true, "errorCapture": "disabled" } }
//
// `broadcast-control.tsx` renders <iframe src="/overlay"> for the live preview,
// and happy-dom really fetches iframe sources. Nothing serves localhost:3000
// during a test run, so that request is still in flight when `cleanup()`
// unmounts the iframe; the resulting abort surfaces as an unhandled
// DOMException that intermittently races process exit and fails the whole run
// with every test passing. The preview iframe's content is not under test here.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { BroadcastControl } from "./broadcast-control";

vi.mock("@/lib/api", () => ({
  api: {
    broadcast: {
      config: vi.fn(async () => ({ config: null, match: null })),
      upsertConfig: vi.fn(async () => ({ config: null })),
      start: vi.fn(async () => ({ config: null })),
      stop: vi.fn(async () => ({ config: null })),
    },
  },
}));

vi.mock("./match-picker", () => ({
  MatchPicker: () => null,
}));

const messages = {
  broadcast: {
    title: "Broadcast Control",
    device: "Device",
    live: "Live",
    idle: "Idle",
    selectedMatch: "Selected Match",
    changeMatch: "Change match",
    config: "Config",
    homeAbbr: "Home",
    guestAbbr: "Guest",
    homeColor: "Home color",
    guestColor: "Guest color",
    useDefault: "Default",
    goLive: "Go Live",
    endBroadcast: "End",
    obsUrl: "OBS URL",
    copy: "Copy",
    noMatch: "No match",
    errors: { matchRequired: "Match required" },
  },
};

function wrap(ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

afterEach(cleanup);

describe("BroadcastControl", () => {
  it("populates the overlay URL only after mount (no SSR mismatch)", () => {
    const { container } = render(
      wrap(
        <BroadcastControl
          deviceId="dragons-1"
          initial={{ config: null, match: null }}
        />,
      ),
    );
    const codeEl = container.querySelector("code");
    expect(codeEl).not.toBeNull();
    expect(codeEl!.textContent).toMatch(/\/overlay$/);
    expect(codeEl!.textContent).toContain(window.location.origin);
  });

  it("renders the same-origin overlay preview iframe", () => {
    render(
      wrap(
        <BroadcastControl
          deviceId="dragons-1"
          initial={{ config: null, match: null }}
        />,
      ),
    );
    const iframe = screen.getByTitle("overlay-preview") as HTMLIFrameElement;
    expect(iframe).toBeInTheDocument();
    expect(iframe.getAttribute("src")).toBe("/overlay");
  });

  it("hides the preview iframe when no deviceId is given", () => {
    render(
      wrap(
        <BroadcastControl
          deviceId=""
          initial={{ config: null, match: null }}
        />,
      ),
    );
    expect(screen.queryByTitle("overlay-preview")).toBeNull();
  });
});
