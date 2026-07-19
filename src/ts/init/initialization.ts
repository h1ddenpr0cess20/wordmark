/**
 * Main initialization coordinator.
 *
 * @remarks
 * Loads all initialization modules and coordinates the startup sequence.
 */

import { elements, state } from "./state.ts";
import { focusUserInputSafely, initializeMobileKeyboardHandling } from "../utils/dom/mobileHandling.ts";
import { STORAGE_KEYS } from "../utils/storage/storage.ts";
import { initializeLocationService } from "../services/location.ts";
import { initMCPServers } from "../services/mcpServers.ts";
import { ensureApiKeysLoaded } from "../services/apiKeys.ts";
import { loadFromUrl } from "../services/history/state.ts";
import { renderChatHistoryList } from "../services/history/list.ts";
import { initializeTts } from "./ttsInitialization.ts";
import { updateParameterControls } from "../components/ui/settingsControls.ts";
import { initTabs, openApiKeysTabIfNeeded } from "../components/ui/settingsTabs.ts";
import { initMemorySettings } from "../components/memory.ts";
import { initStorageSettings } from "../components/storageManager.ts";
import { updateHeaderInfo, updateModelSelector, updateFeatureStatus, initializePersonalityInput, applyDataSettingsState } from "../components/settings.ts";
import { initToolsSettings } from "../components/tools.ts";
import { initSkillsSettings } from "../components/skills.ts";
import { initImageUploads } from "../components/attachments/attachments.ts";
import { initializeModelSettings } from "./modelSettings.ts";
import { setupEventListeners } from "./eventListeners.ts";
import { initializeDOMReferences } from "./dom.ts";
import { initializeAboutTab } from "./aboutTab.ts";
import { initPartyTab } from "../components/party/partyTab.ts";
import { initializeMarked } from "./marked.ts";
import { createScopedLogger } from "../utils/logger.ts";
import {
  initializeServicesAndModels,
  initializeConversationName,
  initializeDefaultValues,
  initializeToolCalling,
  initializeVerboseMode,
  initializeServiceModels,
  selectDefaultService,
} from "./services.ts";

const logInit = createScopedLogger("init");

/**
 * Application entry point invoked once panels are loaded: caches DOM, applies
 * settings/theme, wires event listeners, and initializes services, tools, and
 * conversation state.
 */
export async function initialize() {
  try {
    logInit("Initializing chatbot application...");

    initializeDOMReferences();
    logInit("DOM references initialized.");

    initImageUploads();

    initializeTextareaHeight();

    if (!elements.modelSelector || !elements.userInput) {
      console.error("Essential DOM elements not found. Check your HTML structure.");
      return;
    }

    initializeDefaultValues();

    initializeMarked();
    logInit("Marked (markdown) initialized.");

    initializeAboutTab();

    initializeModelSettings();

    initializeConversationName();

    setupEventListeners();
    logInit("Event listeners set up.");

    initTabs();
    logInit("Settings panel tabs initialized.");

    initToolsSettings();
    logInit("Tools settings initialized.");

    try {
      initPartyTab();
      logInit("Party tab initialized.");
    } catch (e) {
      console.error("Party tab initialization failed:", e);
    }

    {
      try {
        initMemorySettings();
        logInit("Memory settings initialized.");
        updateFeatureStatus();

      } catch (e) {
        console.error("Memory settings initialization failed:", e);
      }
    }

    try {
      initStorageSettings();
      logInit("Storage settings initialized.");
    } catch (e) {
      console.error("Storage settings initialization failed:", e);
    }

    try {
      initMCPServers();
      logInit("MCP servers initialized.");
    } catch (e) {
      console.error("MCP servers initialization failed:", e);
    }

    try {
      initSkillsSettings();
      logInit("Skills settings initialized.");
    } catch (e) {
      console.error("Skills settings initialization failed:", e);
    }

    try {
      loadFromUrl();
      logInit("Loaded chat state from URL (if present).");
    } catch (e) {
      console.warn("Error loading from URL:", e);
    }

    initializeServicesAndModels();

    initializeTts();

    initializeMobileKeyboardHandling();
    logInit("Mobile keyboard handling initialized.");
    updateParameterControls();

    ensureApiKeysLoaded();
    logInit("API keys loaded from localStorage.");

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
    logInit("UI controls and selectors initialized.");

    setupScrollTracking();

    focusInputField();

    initializeToolCalling();
    updateFeatureStatus();

    try {
      applyDataSettingsState();
    } catch (error) {
      console.warn("Failed to apply data-settings state on init:", error);
    }

    renderChatHistoryList();

    initializeVerboseMode();

    if (localStorage.getItem(STORAGE_KEYS.locationEnabled) === "true") {
      initializeLocationService();
    }
    updateFeatureStatus();

    setTimeout(() => {
      openApiKeysTabIfNeeded();
    }, 2000);

    logInit("Chatbot application initialization complete.");

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

