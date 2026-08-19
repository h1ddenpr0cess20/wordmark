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
  const contentDiv = thinkingContainer.querySelector<HTMLElement>(".thinking-content");

  // Collapsing hides the panel, and a hidden element reports (and keeps) a
  // scroll position of zero, so where the reader had got to has to be saved
  // before the class lands rather than restored after it.
  if (!wasCollapsed && contentDiv) {
    thinkingContainer.dataset.scrollTop = String(contentDiv.scrollTop);
  }

  thinkingContainer.classList.toggle("collapsed");

  if (!state.userThinkingState || typeof state.userThinkingState !== "object") {
    state.userThinkingState = {};
  }
  state.userThinkingState[id] = wasCollapsed === true;

  logVerbose(`Toggled thinking container ${id}: ${wasCollapsed ? "expanded" : "collapsed"}`);

  if (wasCollapsed && contentDiv) {
    positionExpandedPanel(thinkingContainer, contentDiv);
  }
}

/**
 * Places a just-expanded reasoning panel.
 *
 * @remarks
 * Reopening returns to wherever the reader left off; a panel opened for the
 * first time starts at the top, unless the turn is still running, in which case
 * it opens on the newest reasoning so it follows the stream instead of sitting
 * at text that has already scrolled away. This used to be an unconditional jump
 * to the top scheduled 100ms out, which threw away the saved position and
 * yanked the panel back from wherever the reader had scrolled in the meantime.
 */
function positionExpandedPanel(container: HTMLElement, contentDiv: HTMLElement) {
  const remembered = Number(container.dataset.scrollTop);
  if (Number.isFinite(remembered) && remembered > 0) {
    contentDiv.scrollTop = remembered;
    return;
  }
  contentDiv.scrollTop = state.isResponsePending ? contentDiv.scrollHeight : 0;
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
