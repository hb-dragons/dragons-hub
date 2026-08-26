// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";

import { setupMegaPanels, setupNavDrawer } from "./nav-drawer";

function build(): {
  nav: HTMLElement;
  open: HTMLButtonElement;
  close: HTMLButtonElement;
  drawer: HTMLElement;
  backdrop: HTMLElement;
  links: HTMLAnchorElement[];
} {
  document.body.innerHTML = `
    <nav id="site-nav">
      <button type="button" id="nav-open" aria-expanded="false" aria-controls="nav-drawer"></button>
      <div id="nav-backdrop"></div>
      <div id="nav-drawer" inert>
        <button type="button" id="nav-close"></button>
        <a href="/">Home</a>
        <a href="/news/">News</a>
      </div>
    </nav>`;
  setupNavDrawer(document);
  return {
    nav: document.getElementById("site-nav") as HTMLElement,
    open: document.getElementById("nav-open") as HTMLButtonElement,
    close: document.getElementById("nav-close") as HTMLButtonElement,
    drawer: document.getElementById("nav-drawer") as HTMLElement,
    backdrop: document.getElementById("nav-backdrop") as HTMLElement,
    links: [...document.querySelectorAll("#nav-drawer a")] as HTMLAnchorElement[],
  };
}

function press(key: string, target: EventTarget = document): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

describe("setupNavDrawer", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-menu-open");
  });

  it("leaves the closed drawer inert and the toggle collapsed", () => {
    const { drawer, open } = build();

    expect(drawer.hasAttribute("inert")).toBe(true);
    expect(open.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens: drops inert, marks the toggle expanded, locks page scroll", () => {
    const { drawer, open, nav } = build();

    open.click();

    expect(nav.hasAttribute("data-menu-open")).toBe(true);
    expect(drawer.hasAttribute("inert")).toBe(false);
    expect(open.getAttribute("aria-expanded")).toBe("true");
    expect(document.documentElement.hasAttribute("data-menu-open")).toBe(true);
  });

  it("moves focus into the drawer on open and back to the toggle on close", () => {
    const { open, close } = build();

    open.click();
    expect(document.activeElement).toBe(close);

    close.click();
    expect(document.activeElement).toBe(open);
  });

  it.each([
    ["the close button", (h: ReturnType<typeof build>) => h.close.click()],
    ["a backdrop tap", (h: ReturnType<typeof build>) => h.backdrop.click()],
    ["Escape", () => press("Escape")],
    ["following a link", (h: ReturnType<typeof build>) => h.links[0].click()],
  ])("closes on %s", (_label, act) => {
    const harness = build();
    harness.open.click();

    act(harness);

    expect(harness.nav.hasAttribute("data-menu-open")).toBe(false);
    expect(harness.drawer.hasAttribute("inert")).toBe(true);
    expect(harness.open.getAttribute("aria-expanded")).toBe("false");
    expect(document.documentElement.hasAttribute("data-menu-open")).toBe(false);
  });

  it("ignores Escape while closed", () => {
    const { nav } = build();

    press("Escape");

    expect(nav.hasAttribute("data-menu-open")).toBe(false);
  });

  it("traps Tab inside the open drawer", () => {
    const { open, close, links } = build();
    open.click();
    const last = links[links.length - 1];

    last.focus();
    press("Tab", last);
    expect(document.activeElement).toBe(close);

    press("Tab", close);
    // Shift+Tab off the first element wraps to the last.
    close.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(last);
  });
});

function buildPanels(): { trigger: HTMLButtonElement; item: HTMLElement } {
  document.body.innerHTML = `
    <ul>
      <li class="nav-item">
        <button type="button" data-panel-toggle aria-expanded="false">Über Uns</button>
        <div class="nav-panel"><a href="/dragons/team/">Team</a></div>
      </li>
    </ul>
    <main><p id="outside">body</p></main>`;
  setupMegaPanels(document);
  return {
    trigger: document.querySelector("[data-panel-toggle]") as HTMLButtonElement,
    item: document.querySelector(".nav-item") as HTMLElement,
  };
}

describe("setupMegaPanels", () => {
  it("opens and closes the panel on tap", () => {
    const { trigger, item } = buildPanels();

    trigger.click();
    expect(item.hasAttribute("data-panel-open")).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    trigger.click();
    expect(item.hasAttribute("data-panel-open")).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it.each([
    ["a tap outside", () => (document.getElementById("outside") as HTMLElement).click()],
    ["Escape", () => press("Escape")],
  ])("closes on %s", (_label, act) => {
    const { trigger, item } = buildPanels();
    trigger.click();

    act();

    expect(item.hasAttribute("data-panel-open")).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});
