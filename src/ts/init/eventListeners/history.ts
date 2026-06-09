import { elements } from "../state.js";
import { renderChatHistoryList } from "../../services/history/list.js";
import { updatePanelOpenState } from "./settingsPanel.js";
export function setupChatHistoryEventListeners() {
  if (elements.historyButton && elements.historyPanel) {
    elements.historyButton.addEventListener("click", () => {
      const isExpanded = elements.historyButton.getAttribute("aria-expanded") === "true";
      elements.historyButton.setAttribute("aria-expanded", String(!isExpanded));
      elements.historyPanel.setAttribute("aria-hidden", String(isExpanded));
      if (!isExpanded) {
        elements.historyPanel.removeAttribute("inert");
        renderChatHistoryList();
      } else {
        elements.historyPanel.setAttribute("inert", "true");
      }

      updatePanelOpenState();
    });
  }

  if (elements.closeHistoryButton && elements.historyPanel) {
    elements.closeHistoryButton.addEventListener("click", () => {
      elements.historyPanel.setAttribute("aria-hidden", "true");
      elements.historyPanel.setAttribute("inert", "true");
      elements.historyButton.setAttribute("aria-expanded", "false");
      elements.historyButton.focus();
      updatePanelOpenState();
    });
  }
}
