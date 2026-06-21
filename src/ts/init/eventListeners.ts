/**
 * Event listener setup.
 *
 * @remarks
 * Aggregates the per-feature event-listener modules and wires them during
 * startup.
 */

import { elements, state } from "./state.ts";
import { logVerbose } from "../utils/logger.ts";
import { showError } from "../utils/notifications.ts";
import { STORAGE_KEYS } from "../utils/storage/storage.ts";
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

/** Aggregator that wires every feature area's event listeners during startup. */
export function setupEventListeners() {
  logVerbose("Setting up event listeners...");

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
      const enabled = (e.target as HTMLInputElement).checked;
      if (enabled) {
        state.shortResponseGuideline = "";
      } else {
        state.shortResponseGuideline = DEFAULT_SHORT_RESPONSE_GUIDELINE || "";
      }
      localStorage.setItem(STORAGE_KEYS.verboseModeEnabled, String(enabled));
    });
  }

  const dataSettingsToggle = elements.dataSettingsToggle;
  if (dataSettingsToggle) {
    try {
      const enabled = getDataSettingsEnabled();
      dataSettingsToggle.checked = enabled;
    } catch (e) {
      console.warn("Failed to read data-settings preference:", e);
    }

    dataSettingsToggle.addEventListener("change", (e) => {
      const on = (e.target as HTMLInputElement).checked;
      setDataSettingsEnabled(on);
      updateFeatureStatus();
    });

    const dataToggleLabel = document.querySelector("label[for=\"data-settings-toggle\"]");
    if (dataToggleLabel) {
      dataToggleLabel.addEventListener("click", (ev: Event) => {
        ev.preventDefault();
        const newVal = !dataSettingsToggle.checked;
        dataSettingsToggle.checked = newVal;
        dataSettingsToggle.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
  }

  let vectorStoreModuleLoadingPromise: Promise<unknown> | null = null;

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
        showError(`Failed to load vector store manager: ${error instanceof Error ? error.message : ""}`);
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

    el.addEventListener("click", async(event: Event) => {
      if (lazyModulesLoaded && lazyModulesLoaded.vectorStore) {
        return;
      }

      event.preventDefault();

      const currentTarget = event.currentTarget as HTMLElement | null;
      const triggerId = currentTarget && currentTarget.id ? currentTarget.id : "";
      const loaded = await ensureVectorStoreModuleLoaded();

      if (!loaded) {
        return;
      }

      if (triggerId === "refresh-vector-stores" || triggerId === "refresh-assistant-files") {
        return;
      }

      requestAnimationFrame(() => {
        if (currentTarget && typeof currentTarget.click === "function") {
          currentTarget.click();
        }
      });
    }, true);
  });
}
