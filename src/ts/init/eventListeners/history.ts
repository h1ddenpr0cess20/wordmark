/**
 * Chat history panel event listeners.
 *
 * @remarks
 * Wires the history panel's open/close toggles and re-renders the saved
 * conversation list when the panel is shown.
 */

import { elements } from "../state.ts";
import { renderChatHistoryList } from "../../services/history/list.ts";
import { isPanelOpen, openPanel, closePanel } from "../../utils/dom/panels.ts";
import { closeSettingsPanelIfOpen } from "./settingsPanel.ts";

/** Wires the history panel toggle button and renders the conversation list. */
export function setupChatHistoryEventListeners() {
  const historyButton = elements.historyButton;
  const historyPanel = elements.historyPanel;
  if (historyButton && historyPanel) {
    historyButton.addEventListener("click", () => {
      if (isPanelOpen(historyPanel)) {
        closePanel({ panel: historyPanel, button: historyButton });
      } else {
        closeSettingsPanelIfOpen();
        closePanel({ panel: elements.galleryPanel, button: elements.galleryButton });
        openPanel({ panel: historyPanel, button: historyButton });
        renderChatHistoryList();
      }
    });
  }

  if (elements.closeHistoryButton && historyPanel && historyButton) {
    elements.closeHistoryButton.addEventListener("click", () => {
      closePanel({ panel: historyPanel, button: historyButton }, { focusButton: true });
    });
  }
}
