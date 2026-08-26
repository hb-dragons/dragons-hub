/**
 * Mobile nav drawer behaviour, kept out of NavBar.astro's inline script so it
 * can be tested (#265). The drawer is moved offscreen by a transform, which
 * hides nothing from the tab order or a screen reader — `inert` does that, and
 * the rest of this module is what a dialog is expected to do: Escape and a
 * backdrop tap close it, focus is trapped while it is open and restored to the
 * toggle on close, and the page behind it does not scroll.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function setupNavDrawer(doc: Document): void {
  const nav = doc.getElementById("site-nav");
  const toggle = doc.getElementById("nav-open");
  const drawer = doc.getElementById("nav-drawer");
  const closeButton = doc.getElementById("nav-close");
  const backdrop = doc.getElementById("nav-backdrop");
  if (!nav || !toggle || !drawer) return;

  const isOpen = () => nav.hasAttribute("data-menu-open");

  const focusable = () => [...drawer.querySelectorAll<HTMLElement>(FOCUSABLE)];

  const open = () => {
    nav.setAttribute("data-menu-open", "");
    drawer.removeAttribute("inert");
    toggle.setAttribute("aria-expanded", "true");
    // Scroll lock lives on the root element: the nav itself is fixed, so
    // locking anything inside it would not stop the page moving behind.
    doc.documentElement.setAttribute("data-menu-open", "");
    focusable()[0]?.focus();
  };

  const close = () => {
    if (!isOpen()) return;
    nav.removeAttribute("data-menu-open");
    drawer.setAttribute("inert", "");
    toggle.setAttribute("aria-expanded", "false");
    doc.documentElement.removeAttribute("data-menu-open");
    toggle.focus();
  };

  toggle.addEventListener("click", open);
  closeButton?.addEventListener("click", close);
  backdrop?.addEventListener("click", close);

  // Astro ships static pages, so a drawer link is a full navigation — but the
  // drawer stays open through the browser's back-forward cache otherwise.
  for (const link of drawer.querySelectorAll("a[href]")) {
    link.addEventListener("click", close);
  }

  doc.addEventListener("keydown", (event) => {
    if (!isOpen()) return;

    if (event.key === "Escape") {
      close();
      return;
    }
    if (event.key !== "Tab") return;

    const items = focusable();
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = doc.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

/**
 * Desktop mega-panels. The "Über uns" trigger is a `<button>` with no href and
 * the panels open on `:hover`/`:focus-within` alone, which leaves them at the
 * mercy of tap-focus on a tablet (#265). A real toggle makes the trigger work
 * by tap and lets assistive tech read its state; the hover rule stays for the
 * pointer case.
 */
export function setupMegaPanels(doc: Document): void {
  const triggers = [...doc.querySelectorAll<HTMLElement>("[data-panel-toggle]")];
  if (triggers.length === 0) return;

  const closeAll = (except?: HTMLElement) => {
    for (const trigger of triggers) {
      if (trigger === except) continue;
      trigger.setAttribute("aria-expanded", "false");
      trigger.closest(".nav-item")?.removeAttribute("data-panel-open");
    }
  };

  for (const trigger of triggers) {
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      const item = trigger.closest(".nav-item");
      if (!item) return;
      const willOpen = !item.hasAttribute("data-panel-open");
      closeAll(trigger);
      item.toggleAttribute("data-panel-open", willOpen);
      trigger.setAttribute("aria-expanded", String(willOpen));
    });
  }

  doc.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof Node && target.parentNode && closestNavItem(target)) return;
    closeAll();
  });
  doc.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAll();
  });
}

function closestNavItem(node: Node): Element | null {
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest(".nav-item") ?? null;
}
