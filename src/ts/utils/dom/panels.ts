/**
 * Shared base for the slide-out panels (settings, history, gallery).
 *
 * @remarks
 * All three panels share one design: a right-edge section that slides into
 * view while `aria-hidden="false"` (the CSS in `components/ui/panels.css`
 * keys the transform off that attribute), is `inert` while closed, and is
 * toggled by a header button that mirrors the state via `aria-expanded`.
 * This module owns that state machine so the panels cannot drift apart, and
 * keeps the `body.panel-open` class in sync for layout that reacts to any
 * panel being open.
 */

import { elements } from "../../init/state.ts";

/** A slide-out panel and the header button that toggles it. */
export interface PanelRefs {
  panel: HTMLElement | null;
  button: HTMLElement | null;
}

/** The three known slide-out panels, resolved from the element cache. */
function knownPanels(): PanelRefs[] {
  return [
    { panel: elements.settingsPanel, button: elements.settingsButton },
    { panel: elements.historyPanel, button: elements.historyButton },
    { panel: elements.galleryPanel, button: elements.galleryButton },
  ];
}

/** Whether a slide-out panel is currently open (visible and interactive). */
export function isPanelOpen(panel: HTMLElement | null): boolean {
  return Boolean(panel && panel.getAttribute("aria-hidden") === "false");
}

/**
 * Syncs the body-level `panel-open` class to reflect whether any slide-out
 * panel is currently open.
 */
export function updatePanelOpenState() {
  if (typeof document === "undefined") {
    return;
  }
  const anyOpen = knownPanels().some(({ panel }) => isPanelOpen(panel));
  document.body.classList.toggle("panel-open", anyOpen);
}

/** Opens a panel: visible, interactive, with its toggle button marked expanded. */
export function openPanel({ panel, button }: PanelRefs) {
  if (!panel) {
    return;
  }
  panel.setAttribute("aria-hidden", "false");
  panel.removeAttribute("inert");
  if (button) {
    button.setAttribute("aria-expanded", "true");
  }
  updatePanelOpenState();
}

/**
 * Closes a panel: hidden, inert, with its toggle button marked collapsed.
 *
 * @param focusButton - When `true`, returns focus to the toggle button.
 */
export function closePanel(
  { panel, button }: PanelRefs,
  { focusButton = false }: { focusButton?: boolean } = {},
) {
  if (!panel) {
    return;
  }
  panel.setAttribute("aria-hidden", "true");
  panel.setAttribute("inert", "true");
  if (button) {
    button.setAttribute("aria-expanded", "false");
    if (focusButton) {
      button.focus();
    }
  }
  updatePanelOpenState();
}

/**
 * Whether a click landed on `element` or inside it.
 *
 * @remarks
 * Prefers the event's composed path over `Element.contains` for two reasons:
 * the path includes descendants of the element even when the literal target is
 * an SVG icon inside a button (a bare `event.target === button` check misses
 * those), and it is captured at dispatch time, so it still answers correctly
 * when an earlier handler removed the clicked node from the DOM (a `contains`
 * check on a detached node would report "outside" and wrongly dismiss a panel
 * the user clicked inside).
 */
export function eventTargetsElement(event: Event, element: Element | null): boolean {
  if (!element) {
    return false;
  }
  if (typeof event.composedPath === "function") {
    return event.composedPath().includes(element);
  }
  const target = event.target as Node | null;
  return Boolean(target && (target === element || element.contains(target)));
}
