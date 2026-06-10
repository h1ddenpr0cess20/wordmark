/**
 * Global tooltip system.
 *
 * @remarks
 * Renders a single shared tooltip element on the top layer and drives it from
 * delegated pointer, focus, and touch events. Native `title` attributes are
 * migrated to `data-tooltip` (and restored on blur) so every tooltip renders
 * with consistent styling; a {@link MutationObserver} migrates elements added
 * after initialization.
 */

let tooltipElement: HTMLElement | null = null;
let tooltipTimeout: ReturnType<typeof setTimeout> | null = null;
/** Delay, in milliseconds, before a hovered tooltip appears. */
const TOOLTIP_DELAY = 500;

/**
 * Creates the shared tooltip element, wires the delegated event listeners, and
 * migrates any existing/future `title` attributes to custom tooltips.
 */
function initTooltipSystem() {
  if (!tooltipElement) {
    tooltipElement = document.createElement("div");
    tooltipElement.className = "tooltip";
    document.body.appendChild(tooltipElement);
  }

  document.addEventListener("mouseenter", handleTooltipMouseEnter, true);
  document.addEventListener("mouseleave", handleTooltipMouseLeave, true);
  document.addEventListener("focusin", handleTooltipFocusIn, true);
  document.addEventListener("focusout", handleTooltipFocusOut, true);
  document.addEventListener("scroll", hideTooltip, true);
  window.addEventListener("resize", hideTooltip);

  document.addEventListener("touchstart", handleTooltipTouchStart, true);
  document.addEventListener("touchend", handleTooltipTouchEnd, true);

  document.addEventListener("touchstart", (event: Event) => {
    if (tooltipElement && tooltipElement.classList.contains("visible")) {
      if (!(event.target as HTMLElement).classList.contains("tool-help-icon")) {
        hideTooltip();
      }
    }
  }, { passive: true });

  migrateAllTitlesToCustomTooltips();

  if (window.MutationObserver) {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (!m.addedNodes) continue;
        m.addedNodes.forEach((node) => {
          if (node && node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (el.hasAttribute && el.hasAttribute("title")) {
              migrateTitle(el);
            }
            if (el.querySelectorAll) {
              el.querySelectorAll<HTMLElement>("[title]").forEach(migrateTitle);
            }
          }
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

/**
 * Schedules a tooltip to appear after {@link TOOLTIP_DELAY} when the pointer
 * enters an element carrying `data-tooltip` or `title`.
 *
 * @remarks
 * Help icons (`.tool-help-icon`) are skipped on mobile, where they are driven
 * by touch instead. A `title`-only element is migrated to `data-tooltip` for
 * the duration of the hover to avoid the native tooltip flickering.
 */
function handleTooltipMouseEnter(event: Event) {
  const target = event.target as HTMLElement | null;
  if (!target || target.nodeType !== Node.ELEMENT_NODE || typeof target.closest !== "function") {
    return;
  }

  if (target.classList.contains("tool-help-icon")) {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                     window.innerWidth <= 768;

    if (isMobile) {
      return;
    }
  }

  const element = target.closest<HTMLElement>("[data-tooltip], [title]");
  if (!element) {
    return;
  }

  let tooltipText = element.getAttribute("data-tooltip");
  if (!tooltipText && element.hasAttribute("title")) {
    const nativeTitle = element.getAttribute("title");
    if (nativeTitle) {
      element.dataset.tooltipRestoreTitle = nativeTitle;
      element.setAttribute("data-tooltip", nativeTitle);
      element.removeAttribute("title");
      tooltipText = nativeTitle;
    }
  }
  if (!tooltipText) return;

  if (tooltipTimeout) {
    clearTimeout(tooltipTimeout);
  }

  tooltipTimeout = setTimeout(() => {
    showTooltip(element, tooltipText);
  }, TOOLTIP_DELAY);
}

/**
 * Hides the tooltip when the pointer leaves the element and restores any
 * `title` attribute that was temporarily migrated on enter.
 */
function handleTooltipMouseLeave(event: Event) {
  const target = event.target as HTMLElement | null;
  if (!target || target.nodeType !== Node.ELEMENT_NODE || typeof target.closest !== "function") {
    return;
  }

  const element = target.closest<HTMLElement>("[data-tooltip], [title]");
  if (!element) {
    return;
  }

  if (tooltipTimeout) {
    clearTimeout(tooltipTimeout);
    tooltipTimeout = null;
  }

  hideTooltip();

  if (element.dataset && element.dataset.tooltipRestoreTitle) {
    const original = element.dataset.tooltipRestoreTitle;
    element.removeAttribute("data-tooltip");
    element.setAttribute("title", original);
    delete element.dataset.tooltipRestoreTitle;
  }
}

/** Shows a tooltip on keyboard focus, migrating `title` to `data-tooltip` if needed. */
function handleTooltipFocusIn(event: Event) {
  const target = event.target as HTMLElement | null;
  if (!target || target.nodeType !== Node.ELEMENT_NODE || typeof target.closest !== "function") return;
  const element = target.closest<HTMLElement>("[data-tooltip], [title]");
  if (!element) return;
  if (!element.getAttribute("data-tooltip") && element.hasAttribute("title")) {
    const t = element.getAttribute("title");
    if (t) {
      element.dataset.tooltipRestoreTitle = t;
      element.setAttribute("data-tooltip", t);
      element.removeAttribute("title");
    }
  }
  const text = element.getAttribute("data-tooltip");
  if (!text) return;
  showTooltip(element, text);
}

/** Hides the tooltip on blur and restores the original `title` if it was migrated. */
function handleTooltipFocusOut(event: Event) {
  const target = event.target as HTMLElement | null;
  if (!target || target.nodeType !== Node.ELEMENT_NODE || typeof target.closest !== "function") return;
  const element = target.closest<HTMLElement>("[data-tooltip], [title]");
  if (!element) return;
  hideTooltip();
  if (element.dataset && element.dataset.tooltipRestoreTitle) {
    const original = element.dataset.tooltipRestoreTitle;
    element.removeAttribute("data-tooltip");
    element.setAttribute("title", original);
    delete element.dataset.tooltipRestoreTitle;
  }
}

/**
 * Migrates a single element's native `title` to `data-tooltip`.
 *
 * @remarks
 * Elements opt out with a `data-native-title` attribute or `dataset.nativeTitle
 * === "true"`.
 */
function migrateTitle(el: HTMLElement) {
  if (!el || !el.getAttribute) return;
  if (el.hasAttribute("data-native-title") || el.dataset.nativeTitle === "true") return;
  const title = el.getAttribute("title");
  if (!title) return;
  el.setAttribute("data-tooltip", title);
  el.removeAttribute("title");
  el.dataset.tooltipMigrated = "true";
}

/** Migrates every current `[title]` element in the document to `data-tooltip`. */
function migrateAllTitlesToCustomTooltips() {
  document.querySelectorAll<HTMLElement>("[title]").forEach(migrateTitle);
}

/** Positions and reveals the shared tooltip element with the given text. */
function showTooltip(element: HTMLElement, text: string) {
  if (!tooltipElement || !text) {
    return;
  }

  tooltipElement.textContent = text;

  tooltipElement.className = "tooltip";
  tooltipElement.classList.add("tool-description");

  positionTooltip(element);

  tooltipElement.classList.add("visible");
}

/** Hides the shared tooltip element and cancels any pending show timeout. */
function hideTooltip() {
  if (!tooltipElement) {
    return;
  }

  tooltipElement.classList.remove("visible");

  if (tooltipTimeout) {
    clearTimeout(tooltipTimeout);
    tooltipTimeout = null;
  }
}

/**
 * Positions the tooltip relative to its target, keeping it within the viewport.
 *
 * @remarks
 * Help icons anchor below-right with an arrow offset; other targets anchor
 * above and flip below (or beside) when they would overflow an edge.
 */
function positionTooltip(element: HTMLElement) {
  if (!tooltipElement) {
    return;
  }

  tooltipElement.style.visibility = "hidden";
  tooltipElement.classList.add("visible");

  const elementRect = element.getBoundingClientRect();
  const tooltipRect = tooltipElement.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
  const scrollY = window.pageYOffset || document.documentElement.scrollTop;

  let left, top;

  tooltipElement.classList.remove("arrow-bottom", "arrow-left", "arrow-right");
  tooltipElement.style.maxWidth = "";
  tooltipElement.style.removeProperty("--arrow-offset");

  if (element.classList.contains("tool-help-icon")) {
    top = elementRect.bottom + scrollY + 5;
    left = elementRect.left + scrollX - 10;
  } else {
    top = elementRect.top + scrollY - tooltipRect.height - 10;
    left = elementRect.left + scrollX + (elementRect.width / 2) - (tooltipRect.width / 2);
  }

  if (!element.classList.contains("tool-help-icon") && elementRect.top < tooltipRect.height + 10) {
    top = elementRect.bottom + scrollY + 10;
  }

  if (left < scrollX + 10) {
    if (elementRect.left < 50 && !element.classList.contains("tool-help-icon")) {
      left = elementRect.right + scrollX + 10;
      top = elementRect.top + scrollY + (elementRect.height / 2) - (tooltipRect.height / 2);
    } else {
      left = scrollX + 10;
      if (element.classList.contains("tool-help-icon")) {
        const arrowOffset = (elementRect.left + scrollX + elementRect.width / 2) - left;
        tooltipElement.style.setProperty("--arrow-offset", `${Math.max(10, Math.min(arrowOffset, tooltipRect.width - 10))}px`);
      }
    }
  } else if (left + tooltipRect.width > scrollX + viewportWidth - 10) {
    if (elementRect.right > viewportWidth - 50 && !element.classList.contains("tool-help-icon")) {
      left = elementRect.left + scrollX - tooltipRect.width - 10;
      top = elementRect.top + scrollY + (elementRect.height / 2) - (tooltipRect.height / 2);
    } else {
      left = scrollX + viewportWidth - tooltipRect.width - 10;
      if (element.classList.contains("tool-help-icon")) {
        const arrowOffset = (elementRect.left + scrollX + elementRect.width / 2) - left;
        tooltipElement.style.setProperty("--arrow-offset", `${Math.max(10, Math.min(arrowOffset, tooltipRect.width - 10))}px`);
      }
    }
  }

  if (top < scrollY + 10) {
    top = scrollY + 10;
  } else if (top + tooltipRect.height > scrollY + viewportHeight - 10) {
    top = scrollY + viewportHeight - tooltipRect.height - 10;
  }

  tooltipElement.style.left = `${Math.round(left)}px`;
  tooltipElement.style.top = `${Math.round(top)}px`;

  tooltipElement.style.visibility = "visible";
}

/**
 * Shows a help-icon tooltip immediately on touch and suppresses the synthetic
 * mouse events that would otherwise follow.
 */
function handleTooltipTouchStart(event: Event) {
  const target = event.target as HTMLElement | null;
  if (!target || !target.classList.contains("tool-help-icon")) {
    return;
  }

  const element = target;
  const tooltipText = element.getAttribute("data-tooltip");
  if (!tooltipText) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (tooltipTimeout) {
    clearTimeout(tooltipTimeout);
  }

  showTooltip(element, tooltipText);

  element.dataset.tooltipTouchActive = "true";
}

/** Auto-hides a touch-triggered tooltip a couple of seconds after the touch ends. */
function handleTooltipTouchEnd(event: Event) {
  const target = event.target as HTMLElement | null;
  if (target && target.dataset.tooltipTouchActive) {
    delete target.dataset.tooltipTouchActive;

    if (tooltipTimeout) {
      clearTimeout(tooltipTimeout);
    }

    tooltipTimeout = setTimeout(() => {
      hideTooltip();
    }, 2000);
  }
}

/** Sets the `data-tooltip` text on an element. */
function addTooltip(element: HTMLElement, text: string) {
  if (!element || !text) {
    return;
  }
  element.setAttribute("data-tooltip", text);
}

/** Removes the `data-tooltip` attribute from an element. */
function removeTooltip(element: HTMLElement) {
  if (!element) {
    return;
  }
  element.removeAttribute("data-tooltip");
}

/** Sets or, when `text` is empty, clears an element's `data-tooltip`. */
function updateTooltip(element: HTMLElement, text: string) {
  if (!element) {
    return;
  }
  if (text) {
    element.setAttribute("data-tooltip", text);
  } else {
    element.removeAttribute("data-tooltip");
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTooltipSystem);
  } else {
    initTooltipSystem();
  }
}

export { initTooltipSystem };

/** Imperative API for managing tooltips from other modules. */
export const tooltipSystem = {
  init: initTooltipSystem,
  show: showTooltip,
  hide: hideTooltip,
  add: addTooltip,
  remove: removeTooltip,
  update: updateTooltip,
  migrateAllTitles: migrateAllTitlesToCustomTooltips,
};
