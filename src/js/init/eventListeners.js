import { initializeConversationInput } from "./eventListeners/conversationInput.js";
import { initializeSettingsPanelControls } from "./eventListeners/settingsPanel.js";
import { setupButtonEventListeners } from "./eventListeners/buttons.js";
import { setupSelectorEventListeners } from "./eventListeners/selectors.js";
import { setupPromptEventListeners } from "./eventListeners/prompts.js";
import { setupTtsEventListeners } from "./eventListeners/tts.js";
import { setupToolCallingEventListeners } from "./eventListeners/tools.js";
import { setupLocationEventListeners } from "./eventListeners/location.js";
import { setupChatHistoryEventListeners } from "./eventListeners/history.js";
import { setupDebugEventListeners } from "./eventListeners/debug.js";

function setupEventListeners() {
  if (window.VERBOSE_LOGGING) {
    console.info("Setting up event listeners...");
  }

  if (!window.userInput || !window.sendButton) {
    console.error("Essential UI elements not found. Check your HTML structure.");
    return;
  }

  initializeConversationInput();
  const { closeSettingsPanel } = initializeSettingsPanelControls();

  setupButtonEventListeners({ closeSettingsPanel });
  setupSelectorEventListeners();
  setupPromptEventListeners({ closeSettingsPanel });
  setupTtsEventListeners();
  setupToolCallingEventListeners();
  setupLocationEventListeners();
  setupChatHistoryEventListeners();
  setupDebugEventListeners();

  if (window.verboseModeToggle) {
    window.verboseModeToggle.addEventListener("change", (e) => {
      const enabled = e.target.checked;
      if (enabled) {
        window.SHORT_RESPONSE_GUIDELINE = "";
      } else {
        window.SHORT_RESPONSE_GUIDELINE = window.DEFAULT_SHORT_RESPONSE_GUIDELINE || "";
      }
      localStorage.setItem("verboseModeEnabled", enabled);
    });
  }

  if (window.dataSettingsToggle) {
    try {
      const enabled = (typeof window.getDataSettingsEnabled === "function") ? window.getDataSettingsEnabled() : true;
      window.dataSettingsToggle.checked = enabled;
    } catch {}

    window.dataSettingsToggle.addEventListener("change", (e) => {
      const on = e.target.checked;
      if (typeof window.setDataSettingsEnabled === "function") {
        window.setDataSettingsEnabled(on);
      } else {
        localStorage.setItem("dataSettingsEnabled", on ? "true" : "false");
        if (typeof window.applyDataSettingsState === "function") {
          window.applyDataSettingsState();
        }
      }
      if (typeof window.updateFeatureStatus === "function") {
        window.updateFeatureStatus();
      }
    });

    const dataToggleLabel = document.querySelector("label[for=\"data-settings-toggle\"]");
    if (dataToggleLabel) {
      dataToggleLabel.addEventListener("click", (ev) => {
        ev.preventDefault();
        const newVal = !window.dataSettingsToggle.checked;
        window.dataSettingsToggle.checked = newVal;
        window.dataSettingsToggle.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
  }
}

window.setupEventListeners = setupEventListeners;

