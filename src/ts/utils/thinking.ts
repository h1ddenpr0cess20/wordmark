/**
 * Collapsible reasoning ("thinking") container UI.
 *
 * @remarks
 * Toggles a reasoning block's collapsed state, persists the per-container
 * preference on {@link state.userThinkingState}, and registers a delegated
 * click handler so `.thinking-title` clicks toggle their container. Lifted out
 * of the generic `utils.ts` grab-bag, which should hold only domain-agnostic
 * helpers.
 */

import { state } from "../init/state.ts";
import { logVerbose } from "./logger.ts";

/**
 * Toggles a reasoning container's collapsed state and remembers the preference.
 *
 * @param id - The id of the thinking container to toggle.
 * @param event - Optional triggering event; bubbling and default are suppressed.
 */
export function toggleThinking(id: string, event?: Event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }

  const thinkingContainer = document.getElementById(id);
  if (!thinkingContainer) {
    console.warn("Thinking container not found:", id);
    return;
  }

  const wasCollapsed = thinkingContainer.classList.contains("collapsed");

  thinkingContainer.classList.toggle("collapsed");

  if (!state.userThinkingState || typeof state.userThinkingState !== "object") {
    state.userThinkingState = {};
  }
  state.userThinkingState[id] = wasCollapsed === true;

  logVerbose(`Toggled thinking container ${id}: ${wasCollapsed ? "expanded" : "collapsed"}`);

  if (wasCollapsed) {
    const contentDiv = thinkingContainer.querySelector(".thinking-content");
    if (contentDiv) {
      setTimeout(() => {
        contentDiv.scrollTop = 0;
      }, 100);
    }
  }
}

if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    const title = target?.closest(".thinking-title");
    if (!title) {
      return;
    }
    const container = title.closest(".thinking-container");
    if (container && container.id) {
      toggleThinking(container.id, event);
    }
  });
}
