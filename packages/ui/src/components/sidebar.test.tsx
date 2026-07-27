// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import * as React from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "./sidebar";
import { TooltipProvider } from "./tooltip";

/**
 * useIsMobile reads window.innerWidth and subscribes to a media query. happy-dom
 * ships neither a resizable viewport nor a listener-bearing matchMedia, so both
 * are stubbed here; every test picks a width before it renders.
 */
function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      media: query,
      matches: width < 768,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

function clearCookies() {
  for (const pair of document.cookie.split(";")) {
    const name = pair.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  }
}

beforeEach(() => {
  clearCookies();
  setViewport(1280);
});

afterEach(cleanup);

function DesktopSidebar({
  collapsible = "icon",
  ...providerProps
}: {
  collapsible?: "offcanvas" | "icon" | "none";
} & React.ComponentProps<typeof SidebarProvider>) {
  return (
    <SidebarProvider {...providerProps}>
      <Sidebar collapsible={collapsible}>
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton>Spiele</SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
      </Sidebar>
      <SidebarTrigger />
    </SidebarProvider>
  );
}

function getSidebar() {
  const el = document.querySelector('[data-slot="sidebar"]');
  if (!el) throw new Error("sidebar not rendered");
  return el;
}

function readStateCookie() {
  return document.cookie
    .split(";")
    .map((pair) => pair.trim())
    .find((pair) => pair.startsWith("sidebar_state="));
}

describe("SidebarProvider keyboard shortcut", () => {
  it("toggles on Ctrl+B", () => {
    render(<DesktopSidebar />);
    expect(getSidebar()).toHaveAttribute("data-state", "expanded");

    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    expect(getSidebar()).toHaveAttribute("data-state", "collapsed");
  });

  it("toggles on Cmd+B for macOS", () => {
    render(<DesktopSidebar />);
    fireEvent.keyDown(window, { key: "b", metaKey: true });
    expect(getSidebar()).toHaveAttribute("data-state", "collapsed");
  });

  it("toggles back on a second press", () => {
    render(<DesktopSidebar />);
    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    expect(getSidebar()).toHaveAttribute("data-state", "expanded");
  });

  it("ignores an unmodified b so typing in a field is unaffected", () => {
    render(<DesktopSidebar />);
    fireEvent.keyDown(window, { key: "b" });
    expect(getSidebar()).toHaveAttribute("data-state", "expanded");
  });

  it("ignores other modified keys", () => {
    render(<DesktopSidebar />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(getSidebar()).toHaveAttribute("data-state", "expanded");
  });

  it("prevents the default so the browser's own Ctrl+B does not fire", () => {
    render(<DesktopSidebar />);
    const event = new KeyboardEvent("keydown", {
      key: "b",
      ctrlKey: true,
      cancelable: true,
      bubbles: true,
    });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
  });

  it("stops listening once the provider unmounts", () => {
    const { unmount } = render(<DesktopSidebar />);
    unmount();
    // The handler writes a cookie on every toggle; no cookie means no handler.
    clearCookies();
    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    expect(readStateCookie()).toBeUndefined();
  });
});

describe("SidebarProvider cookie persistence", () => {
  it("records the collapsed state so the next page load can restore it", () => {
    render(<DesktopSidebar />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
    expect(readStateCookie()).toBe("sidebar_state=false");
  });

  it("records the expanded state when toggled back", () => {
    render(<DesktopSidebar />);
    const trigger = screen.getByRole("button", { name: "Toggle Sidebar" });
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(readStateCookie()).toBe("sidebar_state=true");
  });

  it("writes no cookie until something toggles", () => {
    render(<DesktopSidebar />);
    expect(readStateCookie()).toBeUndefined();
  });

  it("still records the cookie when the open state is controlled from outside", () => {
    // The cookie write sits in setOpen, before the controlled/uncontrolled
    // branch, so a controlled consumer keeps the persistence for free.
    render(<DesktopSidebar open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
    expect(readStateCookie()).toBe("sidebar_state=false");
  });
});

describe("SidebarProvider controlled open state", () => {
  it("renders the open prop rather than its own state", () => {
    render(<DesktopSidebar open={false} onOpenChange={vi.fn()} />);
    expect(getSidebar()).toHaveAttribute("data-state", "collapsed");
  });

  it("reports toggles through onOpenChange and does not self-update", () => {
    const onOpenChange = vi.fn();
    render(<DesktopSidebar open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));

    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(getSidebar()).toHaveAttribute("data-state", "expanded");
  });

  it("honours defaultOpen for the uncontrolled case", () => {
    render(<DesktopSidebar defaultOpen={false} />);
    expect(getSidebar()).toHaveAttribute("data-state", "collapsed");
  });
});

// 086040e7 changed the default collapse from "hide completely" to "collapse to
// icons". The visible difference is entirely the data-collapsible attribute the
// CSS keys off, so that attribute is the behaviour.
describe("Sidebar icon collapse", () => {
  it("marks itself icon-collapsible only once collapsed", () => {
    render(<DesktopSidebar collapsible="icon" />);
    expect(getSidebar()).toHaveAttribute("data-collapsible", "");

    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    expect(getSidebar()).toHaveAttribute("data-collapsible", "icon");
  });

  it("reports offcanvas rather than icon when asked to hide completely", () => {
    render(<DesktopSidebar collapsible="offcanvas" />);
    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    expect(getSidebar()).toHaveAttribute("data-collapsible", "offcanvas");
  });

  it("keeps the icon rail at the icon width instead of zero", () => {
    render(<DesktopSidebar collapsible="icon" />);
    fireEvent.keyDown(window, { key: "b", ctrlKey: true });

    const gap = document.querySelector('[data-slot="sidebar-gap"]');
    // offcanvas collapses the gap to w-0; icon collapses it to the icon width.
    expect(gap?.className).toContain(
      "group-data-[collapsible=icon]:w-(--sidebar-width-icon)",
    );
  });

  it("keeps rendering its menu when collapsed, so the icons survive", () => {
    render(<DesktopSidebar collapsible="icon" />);
    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    expect(screen.getByText("Spiele")).toBeInTheDocument();
  });

  it("hides group labels and sub-buttons at icon width", () => {
    render(
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarGroupLabel>Verwaltung</SidebarGroupLabel>
          <SidebarMenuSubButton href="#">Ligen</SidebarMenuSubButton>
        </Sidebar>
      </SidebarProvider>,
    );
    expect(screen.getByText("Verwaltung").className).toContain(
      "group-data-[collapsible=icon]:opacity-0",
    );
    expect(screen.getByText("Ligen").className).toContain(
      "group-data-[collapsible=icon]:hidden",
    );
  });

  it("renders a plain container with no collapse state when collapsible is none", () => {
    render(<DesktopSidebar collapsible="none" />);
    const sidebar = getSidebar();
    expect(sidebar).not.toHaveAttribute("data-state");
    expect(sidebar).not.toHaveAttribute("data-collapsible");
    expect(screen.getByText("Spiele")).toBeInTheDocument();
  });

  it("leaves a collapsible=none sidebar alone when the shortcut fires", () => {
    render(<DesktopSidebar collapsible="none" />);
    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    expect(getSidebar()).not.toHaveAttribute("data-state");
    expect(screen.getByText("Spiele")).toBeInTheDocument();
  });
});

describe("Sidebar mobile and desktop state are separate", () => {
  it("renders the desktop container above the breakpoint", () => {
    setViewport(1280);
    render(<DesktopSidebar />);
    expect(getSidebar()).toHaveAttribute("data-state");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders nothing until the sheet is opened below the breakpoint", () => {
    setViewport(500);
    render(<DesktopSidebar />);
    // openMobile starts false regardless of defaultOpen, so a phone never
    // loads with the drawer already covering the page.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Spiele")).toBeNull();
  });

  it("opens the sheet on mobile when toggled", () => {
    setViewport(500);
    render(<DesktopSidebar />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Spiele")).toBeInTheDocument();
  });

  it("does not touch the desktop cookie when toggling on mobile", () => {
    setViewport(500);
    render(<DesktopSidebar />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
    // Mobile toggles go through setOpenMobile, which never writes the cookie —
    // otherwise a phone visit would collapse the user's desktop layout.
    expect(readStateCookie()).toBeUndefined();
  });

  it("leaves the desktop open state untouched while toggling on mobile", () => {
    setViewport(500);
    const seen: { open: boolean; openMobile: boolean }[] = [];
    function Probe() {
      const { open, openMobile } = useSidebar();
      seen.push({ open, openMobile });
      return null;
    }
    render(
      <SidebarProvider>
        <Probe />
        <SidebarTrigger />
      </SidebarProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));

    expect(seen.at(-1)).toEqual({ open: true, openMobile: true });
  });

  it("labels the mobile sheet for screen readers", () => {
    setViewport(500);
    render(<DesktopSidebar />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
    expect(screen.getByRole("dialog", { name: "Sidebar" })).toBeInTheDocument();
  });
});

describe("SidebarTrigger and SidebarRail", () => {
  it("runs a caller's onClick as well as the toggle", () => {
    const onClick = vi.fn();
    render(
      <SidebarProvider>
        <Sidebar collapsible="icon" />
        <SidebarTrigger onClick={onClick} />
      </SidebarProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));

    expect(onClick).toHaveBeenCalledOnce();
    expect(getSidebar()).toHaveAttribute("data-state", "collapsed");
  });

  it("gives the rail an accessible name and keeps it out of the tab order", () => {
    render(
      <SidebarProvider>
        <Sidebar collapsible="icon" />
        <SidebarRail />
      </SidebarProvider>,
    );
    const rail = screen.getByRole("button", { name: "Toggle Sidebar" });
    expect(rail).toHaveAttribute("tabindex", "-1");

    fireEvent.click(rail);
    expect(getSidebar()).toHaveAttribute("data-state", "collapsed");
  });
});

// a5ed7584: data-active must be absent rather than "false" when a menu item is
// inactive — Tailwind's data-active: variant matches on attribute presence, so
// data-active="false" painted every item with the accent background.
describe("SidebarMenuButton active marker", () => {
  it("omits data-active entirely when inactive", () => {
    render(
      <SidebarProvider>
        <SidebarMenuButton isActive={false}>Spiele</SidebarMenuButton>
      </SidebarProvider>,
    );
    expect(screen.getByRole("button")).not.toHaveAttribute("data-active");
  });

  it("omits data-active when isActive is not passed at all", () => {
    render(
      <SidebarProvider>
        <SidebarMenuButton>Spiele</SidebarMenuButton>
      </SidebarProvider>,
    );
    expect(screen.getByRole("button")).not.toHaveAttribute("data-active");
  });

  it("sets a bare data-active when active", () => {
    render(
      <SidebarProvider>
        <SidebarMenuButton isActive>Spiele</SidebarMenuButton>
      </SidebarProvider>,
    );
    expect(screen.getByRole("button")).toHaveAttribute("data-active", "true");
  });

  it("applies the same rule to sub-buttons", () => {
    render(
      <SidebarProvider>
        <SidebarMenuSubButton href="#a">Ligen</SidebarMenuSubButton>
        <SidebarMenuSubButton href="#b" isActive>
          Teams
        </SidebarMenuSubButton>
      </SidebarProvider>,
    );
    expect(screen.getByText("Ligen")).not.toHaveAttribute("data-active");
    expect(screen.getByText("Teams")).toHaveAttribute("data-active", "true");
  });
});

describe("SidebarMenuButton tooltip", () => {
  function TooltipCase({
    defaultOpen,
    tooltip,
  }: {
    defaultOpen: boolean;
    tooltip?: string | { children: React.ReactNode };
  }) {
    return (
      <TooltipProvider>
        <SidebarProvider defaultOpen={defaultOpen}>
          <Sidebar collapsible="icon" />
          <SidebarMenuButton tooltip={tooltip}>Spiele</SidebarMenuButton>
        </SidebarProvider>
      </TooltipProvider>
    );
  }

  function openTooltip() {
    const button = screen.getByRole("button", { name: "Spiele" });
    fireEvent.pointerMove(button, { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    return button;
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders a bare button, not a tooltip trigger, when no tooltip is given", () => {
    render(<TooltipCase defaultOpen={false} />);
    expect(screen.getByRole("button", { name: "Spiele" })).not.toHaveAttribute(
      "data-slot",
      "tooltip-trigger",
    );
  });

  it("wraps the button in a tooltip trigger when a tooltip is given", () => {
    render(<TooltipCase defaultOpen={false} tooltip="Spiele" />);
    // asChild merges the trigger onto the menu button rather than nesting one.
    expect(screen.getByRole("button", { name: "Spiele" })).toHaveAttribute(
      "data-state",
    );
  });

  it("hides the tooltip while the sidebar is expanded", () => {
    render(<TooltipCase defaultOpen tooltip="Spiele" />);
    openTooltip();
    // A label the user can already read in the sidebar must not be repeated in
    // a hover tooltip; it is only useful once the sidebar is icons-only.
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows the tooltip once the sidebar is collapsed to icons", () => {
    render(<TooltipCase defaultOpen={false} tooltip="Spiele" />);
    openTooltip();
    expect(screen.getByRole("tooltip")).toHaveTextContent("Spiele");
  });

  it("accepts a props object as well as a bare string", () => {
    render(
      <TooltipCase defaultOpen={false} tooltip={{ children: "Alle Spiele" }} />,
    );
    openTooltip();
    expect(screen.getByRole("tooltip")).toHaveTextContent("Alle Spiele");
  });
});

// The remaining exports are layout slots. They carry no logic, but they live in
// the same file as the logic above and every admin page composes them, so one
// pass asserts the data-slot contract those pages and the CSS both key off.
describe("Sidebar layout slots", () => {
  it("renders every slot with its data-slot marker", () => {
    render(
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader>Dragons</SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Verwaltung</SidebarGroupLabel>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton>Spiele</SidebarMenuButton>
                  <SidebarMenuSub>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton href="#">
                        Ligen
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>Abmelden</SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset>Inhalt</SidebarInset>
      </SidebarProvider>,
    );

    for (const slot of [
      "sidebar-header",
      "sidebar-content",
      "sidebar-group",
      "sidebar-group-label",
      "sidebar-menu",
      "sidebar-menu-item",
      "sidebar-menu-button",
      "sidebar-menu-sub",
      "sidebar-menu-sub-item",
      "sidebar-menu-sub-button",
      "sidebar-footer",
      "sidebar-rail",
      "sidebar-inset",
    ]) {
      expect(document.querySelector(`[data-slot="${slot}"]`)).not.toBeNull();
    }
  });

  it("renders the group label as its child element when asChild is set", () => {
    render(
      <SidebarProvider>
        <SidebarGroupLabel asChild>
          <h2>Verwaltung</h2>
        </SidebarGroupLabel>
      </SidebarProvider>,
    );
    expect(
      screen.getByRole("heading", { name: "Verwaltung" }),
    ).toHaveAttribute("data-slot", "sidebar-group-label");
  });

  it("renders a menu button as its child element when asChild is set", () => {
    render(
      <SidebarProvider>
        <SidebarMenuButton asChild>
          <a href="/admin/spiele">Spiele</a>
        </SidebarMenuButton>
      </SidebarProvider>,
    );
    expect(screen.getByRole("link", { name: "Spiele" })).toHaveAttribute(
      "data-slot",
      "sidebar-menu-button",
    );
  });

  it("carries the requested size onto the menu button", () => {
    render(
      <SidebarProvider>
        <SidebarMenuButton size="lg">Spiele</SidebarMenuButton>
      </SidebarProvider>,
    );
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("data-size", "lg");
    expect(button.className).toContain("h-12");
  });

  it("carries the outline variant onto the menu button", () => {
    render(
      <SidebarProvider>
        <SidebarMenuButton variant="outline">Spiele</SidebarMenuButton>
      </SidebarProvider>,
    );
    expect(screen.getByRole("button").className).toContain("bg-background");
  });
});

describe("useSidebar", () => {
  it("throws a named error outside a provider", () => {
    function Orphan() {
      useSidebar();
      return null;
    }
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    expect(() => render(<Orphan />)).toThrow(
      "useSidebar must be used within a SidebarProvider.",
    );
    consoleError.mockRestore();
  });

  it("exposes state alongside the open flag", () => {
    let ctx: ReturnType<typeof useSidebar> | undefined;
    function Probe() {
      ctx = useSidebar();
      return null;
    }
    render(
      <SidebarProvider>
        <Probe />
      </SidebarProvider>,
    );
    expect(ctx?.state).toBe("expanded");

    act(() => ctx?.setOpen(false));
    expect(ctx?.state).toBe("collapsed");
  });

  it("accepts an updater function in setOpen", () => {
    let ctx: ReturnType<typeof useSidebar> | undefined;
    function Probe() {
      ctx = useSidebar();
      return null;
    }
    render(
      <SidebarProvider>
        <Probe />
      </SidebarProvider>,
    );
    act(() =>
      (ctx as unknown as { setOpen: (fn: (v: boolean) => boolean) => void })
        .setOpen((v) => !v),
    );
    expect(ctx?.state).toBe("collapsed");
  });
});
