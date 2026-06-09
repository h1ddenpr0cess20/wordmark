import { elements, state } from "./state.ts";
import { showError } from "../utils/notifications.ts";
import { getDataSettingsEnabled, setDataSettingsEnabled, updateFeatureStatus } from "../components/settings.ts";
import { loadVectorStoreModule, lazyModulesLoaded } from "../utils/lazyLoader.ts";
import { initializeConversationInput } from "./eventListeners/conversationInput.ts";
import { initializeSettingsPanelControls } from "./eventListeners/settingsPanel.ts";
import { setupButtonEventListeners } from "./eventListeners/buttons.ts";
import { setupSelectorEventListeners } from "./eventListeners/selectors.ts";
import { setupPromptEventListeners } from "./eventListeners/prompts.ts";
import { setupTtsEventListeners } from "./eventListeners/tts.ts";
import { setupToolCallingEventListeners } from "./eventListeners/tools.ts";
import { setupLocationEventListeners } from "./eventListeners/location.ts";
import { setupChatHistoryEventListeners } from "./eventListeners/history.ts";
import { setupDebugEventListeners } from "./eventListeners/debug.ts";
import { DEFAULT_SHORT_RESPONSE_GUIDELINE } from "../../config/config.ts";

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
      const enabled = (e.target as any).checked;
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
      const on = (e.target as any).checked;
      setDataSettingsEnabled(on);
      updateFeatureStatus();
    });

    const dataToggleLabel = document.querySelector("label[for=\"data-settings-toggle\"]") as any;
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
    const el = document.querySelector(selector) as any;
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
