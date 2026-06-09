import { elements } from "../state.ts";
import { renderChatHistoryList } from "../../services/history/list.ts";
import { updatePanelOpenState } from "./settingsPanel.ts";
export function setupChatHistoryEventListeners() {
  const historyButton = elements.historyButton;
  const historyPanel = elements.historyPanel;
  if (historyButton && historyPanel) {
    historyButton.addEventListener("click", () => {
      const isExpanded = historyButton.getAttribute("aria-expanded") === "true";
      historyButton.setAttribute("aria-expanded", String(!isExpanded));
      historyPanel.setAttribute("aria-hidden", String(isExpanded));
      if (!isExpanded) {
        historyPanel.removeAttribute("inert");
        renderChatHistoryList();
      } else {
        historyPanel.setAttribute("inert", "true");
      }

      updatePanelOpenState();
    });
  }

  if (elements.closeHistoryButton && historyPanel && historyButton) {
    elements.closeHistoryButton.addEventListener("click", () => {
      historyPanel.setAttribute("aria-hidden", "true");
      historyPanel.setAttribute("inert", "true");
      historyButton.setAttribute("aria-expanded", "false");
      historyButton.focus();
      updatePanelOpenState();
    });
  }
}
