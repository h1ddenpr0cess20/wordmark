import { elements, state } from "./state.js";
import { showError } from "../utils/notifications.js";
import { getDataSettingsEnabled, setDataSettingsEnabled, updateFeatureStatus } from "../components/settings.js";
import { loadVectorStoreModule, lazyModulesLoaded } from "../utils/lazyLoader.js";
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
import { DEFAULT_SHORT_RESPONSE_GUIDELINE } from "../../config/config.js";

export function setupEventListeners() {
  if (state.verboseLogging) {
    console.info("Setting up event listeners...");
  }

  if (!elements.userInput || !elements.sendButton) {
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

  if (elements.verboseModeToggle) {
    elements.verboseModeToggle.addEventListener("change", (e) => {
      const enabled = e.target.checked;
      if (enabled) {
        state.shortResponseGuideline = "";
      } else {
        state.shortResponseGuideline = DEFAULT_SHORT_RESPONSE_GUIDELINE || "";
      }
      localStorage.setItem("verboseModeEnabled", enabled);
    });
  }

  if (elements.dataSettingsToggle) {
    try {
      const enabled = getDataSettingsEnabled();
      elements.dataSettingsToggle.checked = enabled;
    } catch {}

    elements.dataSettingsToggle.addEventListener("change", (e) => {
      const on = e.target.checked;
      setDataSettingsEnabled(on);
      updateFeatureStatus();
    });

    const dataToggleLabel = document.querySelector("label[for=\"data-settings-toggle\"]");
    if (dataToggleLabel) {
      dataToggleLabel.addEventListener("click", (ev) => {
        ev.preventDefault();
        const newVal = !elements.dataSettingsToggle.checked;
        elements.dataSettingsToggle.checked = newVal;
        elements.dataSettingsToggle.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
  }

  let vectorStoreModuleLoadingPromise = null;

  async function ensureVectorStoreModuleLoaded() {
    if (lazyModulesLoaded && lazyModulesLoaded.vectorStore) {
      return true;
    }

    if (!vectorStoreModuleLoadingPromise) {
      vectorStoreModuleLoadingPromise = loadVectorStoreModule().finally(() => {
        vectorStoreModuleLoadingPromise = null;
      });
    }

    try {
      await vectorStoreModuleLoadingPromise;
      return true;
    } catch (error) {
      console.error("Vector store module failed to load:", error);
      if (showError) {
        showError(`Failed to load vector store manager: ${error.message}`);
      }
      return false;
    }
  }

  const manualLoadSelectors = [
    "#refresh-vector-stores",
    "#clear-active-vector-store",
    "#refresh-assistant-files",
    "#upload-assistant-files",
    "#delete-all-assistant-files",
  ];

  manualLoadSelectors.forEach(selector => {
    const el = document.querySelector(selector);
    if (!el) return;

    el.addEventListener("click", async(event) => {
      if (lazyModulesLoaded && lazyModulesLoaded.vectorStore) {
        return;
      }

      event.preventDefault();

      const triggerId = event.currentTarget && event.currentTarget.id ? event.currentTarget.id : "";
      const loaded = await ensureVectorStoreModuleLoaded();

      if (!loaded) {
        return;
      }

      if (triggerId === "refresh-vector-stores" || triggerId === "refresh-assistant-files") {
        return;
      }

      requestAnimationFrame(() => {
        if (event.currentTarget && typeof event.currentTarget.click === "function") {
          event.currentTarget.click();
        }
      });
    }, true);
  });
}
