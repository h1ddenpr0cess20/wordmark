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

  if (typeof window.loadVectorStoreModule === "function") {
    let vectorStoreModuleLoadingPromise = null;

    async function ensureVectorStoreModuleLoaded() {
      if (window.lazyModulesLoaded && window.lazyModulesLoaded.vectorStore) {
        return true;
      }

      if (!vectorStoreModuleLoadingPromise) {
        vectorStoreModuleLoadingPromise = window.loadVectorStoreModule().finally(() => {
          vectorStoreModuleLoadingPromise = null;
        });
      }

      try {
        await vectorStoreModuleLoadingPromise;
        return true;
      } catch (error) {
        console.error("Vector store module failed to load:", error);
        if (window.showError) {
          window.showError(`Failed to load vector store manager: ${error.message}`);
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
        if (window.lazyModulesLoaded && window.lazyModulesLoaded.vectorStore) {
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
}

window.setupEventListeners = setupEventListeners;
