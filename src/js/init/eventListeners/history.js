import { loadHistoryModule, lazyModulesLoaded } from "../../utils/lazyLoader.js";
import { renderChatHistoryList } from "../../services/history/list.js";
export function setupChatHistoryEventListeners() {
  if (window.historyButton && window.historyPanel) {
    window.historyButton.addEventListener('click', async() => {
      if (typeof loadHistoryModule === 'function' && !lazyModulesLoaded?.history) {
        await loadHistoryModule();
      }
      const isExpanded = window.historyButton.getAttribute('aria-expanded') === 'true';
      window.historyButton.setAttribute('aria-expanded', String(!isExpanded));
      window.historyPanel.setAttribute('aria-hidden', String(isExpanded));
      if (!isExpanded) {
        window.historyPanel.removeAttribute('inert');
        renderChatHistoryList();
      } else {
        window.historyPanel.setAttribute('inert', 'true');
      }

      if (typeof window.updatePanelOpenState === 'function') {
        window.updatePanelOpenState();
      }
    });
  }

  if (window.closeHistoryButton && window.historyPanel) {
    window.closeHistoryButton.addEventListener('click', () => {
      window.historyPanel.setAttribute('aria-hidden', 'true');
      window.historyPanel.setAttribute('inert', 'true');
      window.historyButton.setAttribute('aria-expanded', 'false');
      window.historyButton.focus();
      if (typeof window.updatePanelOpenState === 'function') {
        window.updatePanelOpenState();
      }
    });
  }
}
