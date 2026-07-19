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

  scrollChatToBottomOnOrientationChange();

  suppressPanelTransitionsDuringResize();
}

/**
 * Scrolls the chat to the bottom after an orientation change.
 *
 * @remarks
 * Rotating reflows the chat box and loses the scroll position. Re-pins to the
 * bottom each frame until the chat height settles, since the reflow isn't
 * complete on the first frame and an early pin would land at the top.
 */
export function scrollChatToBottomOnOrientationChange() {
  const chatBox = elements.chatBox;
  if (!chatBox) {
    return;
  }

  let wasLandscape = window.innerWidth > window.innerHeight;

  const scrollToBottom = () => {
    let lastHeight = -1;
    let stableFrames = 0;
    let totalFrames = 0;
    const step = () => {
      chatBox.scrollTop = chatBox.scrollHeight;
      totalFrames += 1;
      if (chatBox.scrollHeight === lastHeight) {
        stableFrames += 1;
      } else {
        stableFrames = 0;
        lastHeight = chatBox.scrollHeight;
      }
      if (stableFrames < 3 && totalFrames < 60) {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  };

  const onResize = () => {
    const isLandscape = window.innerWidth > window.innerHeight;
    if (isLandscape !== wasLandscape) {
      wasLandscape = isLandscape;
      scrollToBottom();
    }
  };

  window.addEventListener("orientationchange", scrollToBottom);
  window.addEventListener("resize", onResize);
}

/**
 * Disables the slide-out panel transitions while the viewport is resizing.
 *
 * @remarks
 * A closed panel sits at `transform: translateX(100%)`, where `100%` is the
 * panel's own width. Rotating the device changes that width (full-width in
 * portrait, fixed in landscape), so the off-screen offset recomputes — and the
 * `transition: transform` would animate it, briefly sliding the closed panel
 * into view. Toggling `panels-no-transition` during the resize suppresses that,
 * then restores the transition once the viewport settles so opening/closing
 * still animates.
 */
export function suppressPanelTransitionsDuringResize() {
  let settleTimer: number | undefined;

  const onResize = () => {
    document.body.classList.add("panels-no-transition");
    if (settleTimer !== undefined) {
      window.clearTimeout(settleTimer);
    }
    settleTimer = window.setTimeout(() => {
      document.body.classList.remove("panels-no-transition");
      settleTimer = undefined;
    }, 250);
  };

  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);
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

  promptContainer.removeEventListener("click", handlePromptTap);
  promptContainer.addEventListener("click", handlePromptTap);

  document.removeEventListener("click", handlePromptOutsideTap);
  document.addEventListener("click", handlePromptOutsideTap);
}

/** Toggles the system-prompt area open or closed on tap. */
function handlePromptTap(e: Event) {
  const container = document.getElementById("model-info");
  if (!container) {
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  container.classList.toggle("expanded");
}

/** Collapses the expanded system-prompt area when tapping outside it. */
function handlePromptOutsideTap(e: Event) {
  const container = document.getElementById("model-info");
  if (!container) {
    return;
  }
  if (!container.contains(e.target as Node) && container.classList.contains("expanded")) {
    container.classList.remove("expanded");
  }
}
