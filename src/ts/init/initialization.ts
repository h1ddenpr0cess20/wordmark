/**
 * Main initialization coordinator.
 *
 * @remarks
 * Loads all initialization modules and coordinates the startup sequence.
 */

import { elements, state } from "./state.ts";
import { focusUserInputSafely } from "../utils/mobileHandling.ts";
import { STORAGE_KEYS } from "../utils/storage.ts";
import { initializeLocationService } from "../services/location.ts";
import { initMCPServers } from "../services/mcpServers.ts";
import { ensureApiKeysLoaded } from "../services/apiKeys.ts";
import { loadFromUrl } from "../services/history/state.ts";
import { renderChatHistoryList } from "../services/history/list.ts";
import { initializeTts, initializeMobileKeyboardHandling } from "./ttsInitialization.ts";
import { updateParameterControls } from "../components/ui/settingsControls.ts";
import { initTabs, openApiKeysTabIfNeeded } from "../components/ui/settingsTabs.ts";
import { initMemorySettings } from "../components/memory.ts";
import { updateHeaderInfo, updateModelSelector, updateFeatureStatus, initializePersonalityInput, applyDataSettingsState } from "../components/settings.ts";
import { initToolsSettings } from "../components/tools.ts";
import { initImageUploads } from "../components/attachments.ts";
import { initializeModelSettings } from "./modelSettings.ts";
import { setupEventListeners } from "./eventListeners.ts";
import { initializeDOMReferences } from "./dom.ts";
import { initializeAboutTab } from "./aboutTab.ts";
import { initializeMarked } from "./marked.ts";
import {
  initializeServicesAndModels,
  initializeConversationName,
  initializeDefaultValues,
  initializeToolCalling,
  initializeVerboseMode,
  initializeServiceModels,
  selectDefaultService,
} from "./services.ts";

/**
 * Application entry point invoked once panels are loaded: caches DOM, applies
 * settings/theme, wires event listeners, and initializes services, tools, and
 * conversation state.
 */
export async function initialize() {
  try {
    if (state.verboseLogging) {
      console.info("Initializing chatbot application...");
    }

    initializeDOMReferences();
    if (state.verboseLogging) {
      console.info("DOM references initialized.");
    }

    initImageUploads();

    initializeTextareaHeight();

    if (!elements.modelSelector || !elements.userInput) {
      console.error("Essential DOM elements not found. Check your HTML structure.");
      return;
    }

    initializeDefaultValues();

    initializeMarked();
    if (state.verboseLogging) {
      console.info("Marked (markdown) initialized.");
    }

    initializeAboutTab();

    initializeModelSettings();

    initializeConversationName();

    setupEventListeners();
    if (state.verboseLogging) {
      console.info("Event listeners set up.");
    }

    initTabs();
    if (state.verboseLogging) {
      console.info("Settings panel tabs initialized.");
    }

    initToolsSettings();
    if (state.verboseLogging) {
      console.info("Tools settings initialized.");
    }

    {
      try {
        initMemorySettings();
        if (state.verboseLogging) {
          console.info("Memory settings initialized.");
        }
        updateFeatureStatus();

      } catch (e) {
        console.error("Memory settings initialization failed:", e);
      }
    }

    try {
      initMCPServers();
      if (state.verboseLogging) {
        console.info("MCP servers initialized.");
      }
    } catch (e) {
      console.error("MCP servers initialization failed:", e);
    }

    try {
      loadFromUrl();
      if (state.verboseLogging) {
        console.info("Loaded chat state from URL (if present).");
      }
    } catch (e) {
      console.warn("Error loading from URL:", e);
    }

    initializeServicesAndModels();

    initializeTts();

    initializeMobileKeyboardHandling();
    if (state.verboseLogging) {
      console.info("Mobile keyboard handling initialized.");
    }
    updateParameterControls();

    ensureApiKeysLoaded();
    if (state.verboseLogging) {
      console.info("API keys loaded from localStorage.");
    }

    const runStandardModelInit = () => {
      initializeServiceModels();
    };
    selectDefaultService()
      .then((handled) => {
        if (!handled) {
          runStandardModelInit();
        }
      })
      .catch(runStandardModelInit);

    initializePersonalityInput();

    updateModelSelector();
    updateHeaderInfo();
    if (state.verboseLogging) {
      console.info("UI controls and selectors initialized.");
    }

    setupScrollTracking();

    focusInputField();

    initializeToolCalling();
    updateFeatureStatus();

    try { applyDataSettingsState(); } catch { /* noop */ }

    renderChatHistoryList();

    initializeVerboseMode();

    if (localStorage.getItem(STORAGE_KEYS.locationEnabled) === "true") {
      initializeLocationService();
    }
    updateFeatureStatus();

    setTimeout(() => {
      openApiKeysTabIfNeeded();
    }, 2000);

    if (state.verboseLogging) {
      console.info("Chatbot application initialization complete.");
    }

    document.body.classList.add("loaded");

  } catch (error) {
    console.error("Initialization error:", error);
    document.body.classList.add("loaded");
  }
}

/**
 * Setup scroll tracking for auto-scroll functionality
 */
function setupScrollTracking() {
  const chatBox = elements.chatBox;
  if (!chatBox) {
    return;
  }
  chatBox.addEventListener("scroll", () => {
    const wasAtBottom = chatBox.scrollHeight - chatBox.clientHeight - chatBox.scrollTop < 20;
    state.shouldAutoScroll = wasAtBottom;
  });
}

/**
 * Focuses the user input safely, deferring to mobile-aware handling.
 */
function focusInputField() {
  focusUserInputSafely();
}

/**
 * Initialize textarea height to prevent changing height when typing starts
 */
function initializeTextareaHeight() {
  if (elements.userInput) {
    elements.userInput.style.height = "56px";
  }
}

