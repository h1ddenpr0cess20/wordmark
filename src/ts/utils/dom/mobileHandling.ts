/**
 * Mobile keyboard and scrolling behavior helpers.
 *
 * @remarks
 * Keeps the input visible when the on-screen keyboard appears, smooths
 * touch scrolling, and adds tap-to-expand behavior for the system-prompt area.
 */

import { elements } from "../../init/state.ts";

/** Returns `true` when the current device looks like a phone or small tablet. */
export function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         window.innerWidth <= 768;
}

/**
 * Wires keyboard-appearance handling so the input scrolls into view.
 *
 * @remarks
 * Prefers the Visual Viewport API (which fires on keyboard show/hide) and falls
 * back to a focus listener on the input.
 */
export function setupMobileKeyboardHandling() {
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      if (document.activeElement === elements.userInput) {
        scrollInputIntoView();
      }
    });
  }

  if (elements.userInput) {
    elements.userInput.addEventListener("focus", scrollInputIntoView);
  }
}

/**
 * Scrolls the input container into view after the keyboard settles.
 *
 * @remarks
 * Adds bottom padding on iOS, where the input otherwise sits flush against the
 * screen edge.
 */
export function scrollInputIntoView() {
  setTimeout(() => {
    const inputContainer = document.querySelector(".input-container");

    if (inputContainer) {
      inputContainer.scrollIntoView({ behavior: "auto", block: "end" });

      if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        document.body.style.paddingBottom = "20px";
      }
    }
  }, 100);
}

/**
 * Focuses the user input on desktop only.
 *
 * @remarks
 * On mobile, focus is intentionally not forced to avoid popping up the keyboard
 * unexpectedly.
 */
export function focusUserInputSafely() {
  if (!elements.userInput) {
    return;
  }

  const isMobile = isMobileDevice();

  if (!isMobile) {
    elements.userInput.focus();
  }
}

/**
 * Initializes all mobile behaviors: keyboard handling, the `mobile-device` body
 * class, scroll optimization, and prompt tap-to-expand.
 */
export function initializeMobileKeyboardHandling() {
  setupMobileKeyboardHandling();

  const isMobile = isMobileDevice();

  if (isMobile) {
    document.body.classList.add("mobile-device");
  }

  optimizeScrolling();

  setupPromptTapExpand();
}

/** Registers passive touch listeners so scrolling stays responsive on mobile. */
export function optimizeScrolling() {
  document.addEventListener("touchstart", () => {}, { passive: true });
  document.addEventListener("touchmove", () => {}, { passive: true });
}

/**
 * Scrolls an element to a vertical position, instantly on mobile and on the
 * next animation frame on desktop.
 *
 * @param element - Scrollable element, or `null` to no-op.
 * @param to - Target `scrollTop` value.
 */
export function fastScroll(element: HTMLElement | null, to: number) {
  if (!element) {
    return;
  }

  const isMobile = document.body.classList.contains("mobile-device");

  if (isMobile) {
    element.scrollTop = to;
  } else {
    requestAnimationFrame(() => {
      element.scrollTop = to;
    });
  }
}

/**
 * Enables tap-to-expand on the system-prompt area on mobile.
 *
 * @remarks
 * Defers until the DOM is ready and the `#model-info` container exists, then
 * toggles its `expanded` class on tap and collapses it when tapping elsewhere.
 * No-ops on desktop.
 */
export function setupPromptTapExpand() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupPromptTapExpand);
    return;
  }

  const promptContainer = document.getElementById("model-info");
  if (!promptContainer) {
    setTimeout(setupPromptTapExpand, 1000);
    return;
  }

  const isMobile = isMobileDevice();
  if (!isMobile) {
    return;
  }

  const container = promptContainer;

  container.removeEventListener("click", handlePromptTap);

  function handlePromptTap(e: Event) {
    e.preventDefault();
    e.stopPropagation();

    if (container.classList.contains("expanded")) {
      container.classList.remove("expanded");
    } else {
      container.classList.add("expanded");
    }
  }

  container.addEventListener("click", handlePromptTap);

  document.addEventListener("click", (e) => {
    if (!promptContainer.contains(e.target as Node) && promptContainer.classList.contains("expanded")) {
      promptContainer.classList.remove("expanded");
    }
  });
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("load", () => {
    setTimeout(setupPromptTapExpand, 100);
  });
}
