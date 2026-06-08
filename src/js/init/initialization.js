/**
 * Main initialization coordinator for the chatbot application
 * This file loads all initialization modules and coordinates the startup process
 */

import { elements, state } from "./state.js";
import { focusUserInputSafely } from "../utils/mobileHandling.js";
import { initializeLocationService } from "../services/location.js";
import { initMCPServers } from "../services/mcpServers.js";
import { ensureApiKeysLoaded } from "../services/apiKeys.js";
import { loadFromUrl } from "../services/history/state.js";
import { renderChatHistoryList } from "../services/history/list.js";
import { initializeTts, initializeMobileKeyboardHandling } from "./ttsInitialization.js";
import { updateParameterControls } from "../components/ui/settingsControls.js";
import { initTabs, openApiKeysTabIfNeeded } from "../components/ui/settingsTabs.js";
import { initMemorySettings } from "../components/memory.js";
import { updateHeaderInfo, updateModelSelector, updateFeatureStatus, initializePersonalityInput, applyDataSettingsState } from "../components/settings.js";
import { initToolsSettings } from "../components/tools.js";
import { initImageUploads } from "../components/attachments.js";
import { initializeModelSettings } from "./modelSettings.js";
import { setupEventListeners } from "./eventListeners.js";
import { initializeDOMReferences } from "./dom.js";
import { initializeAboutTab } from "./aboutTab.js";
import { initializeMarked } from "./marked.js";
import {
  initializeServicesAndModels,
  initializeConversationName,
  initializeDefaultValues,
  initializeToolCalling,
  initializeVerboseMode,
  initializeServiceModels,
  selectDefaultService,
} from "./services.js";

// Main initialization function
export async function initialize() {
  try {
    if (window.VERBOSE_LOGGING) {
      console.info("Initializing chatbot application...");
    }

    // Initialize DOM references first
    initializeDOMReferences();
    if (window.VERBOSE_LOGGING) {
      console.info("DOM references initialized.");
    }

    initImageUploads();

    // Initialize textarea height to prevent shrinking when typing
    initializeTextareaHeight();

    // Check if essential elements are available
    if (!elements.modelSelector || !elements.userInput) {
      console.error("Essential DOM elements not found. Check your HTML structure.");
      return;
    }

    // Initialize default values from config
    initializeDefaultValues();

    // Initialize Markdown parser (Marked)
    initializeMarked();
    if (window.VERBOSE_LOGGING) {
      console.info("Marked (markdown) initialized.");
    }

    // Initialize About tab
    initializeAboutTab();

    // Initialize model parameter controls with values from config
    initializeModelSettings();

    // Set initial conversation name based on personality/prompt type
    initializeConversationName();

    // Setup event listeners
    setupEventListeners();
    if (window.VERBOSE_LOGGING) {
      console.info("Event listeners set up.");
    }

    // Initialize tabs in settings panel
    initTabs();
    if (window.VERBOSE_LOGGING) {
      console.info("Settings panel tabs initialized.");
    }

    // Initialize tools settings
    initToolsSettings();
    if (window.VERBOSE_LOGGING) {
      console.info("Tools settings initialized.");
    }

    // Initialize memory settings (separate from tools UI)
    {
      try {
        initMemorySettings();
        if (window.VERBOSE_LOGGING) {
          console.info("Memory settings initialized.");
        }
        // Sync feature badges after memory init
        updateFeatureStatus();

      } catch (e) {
        console.error("Memory settings initialization failed:", e);
      }
    }

    // Initialize MCP servers management
    try {
      initMCPServers();
      if (window.VERBOSE_LOGGING) {
        console.info("MCP servers initialized.");
      }
    } catch (e) {
      console.error("MCP servers initialization failed:", e);
    }

    // Try to load from URL if available
    try {
      loadFromUrl();
      if (window.VERBOSE_LOGGING) {
        console.info("Loaded chat state from URL (if present).");
      }
    } catch (e) {
      console.warn("Error loading from URL:", e);
    }

    // Initialize services and models
    initializeServicesAndModels();

    // Initialize TTS voice selector and provider state
    initializeTts();

    // Initialize mobile keyboard handling
    initializeMobileKeyboardHandling();
    if (window.VERBOSE_LOGGING) {
      console.info("Mobile keyboard handling initialized.");
    }
    // Call these functions to initialize the UI
    updateParameterControls();

    // Ensure API keys are loaded before fetching models
    ensureApiKeysLoaded();
    if (window.VERBOSE_LOGGING) {
      console.info("API keys loaded from localStorage.");
    }

    // Fetch models dynamically now that API keys are available. First try to
    // auto-select a default provider when no cloud API keys are configured
    // (LM Studio, then Ollama). If that already fetched models, skip the
    // standard fetch to avoid a duplicate request.
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

    // Explicitly initialize personality input
    initializePersonalityInput();

    updateModelSelector();
    updateHeaderInfo();
    if (window.VERBOSE_LOGGING) {
      console.info("UI controls and selectors initialized.");
    }

    // Add scroll event listener to chatBox to track when user manually scrolls
    setupScrollTracking();

    // Focus the user input safely (checks for mobile device)
    focusInputField();

    // Initialize tool calling toggle state
    initializeToolCalling();
    updateFeatureStatus();

    // Apply data settings enabled/disabled state to the Data tab UI
    try { applyDataSettingsState(); } catch { /* noop */ }

    renderChatHistoryList();

    // Initialize Verbose Mode toggle state
    initializeVerboseMode();

    // Load location services if previously enabled
    if (localStorage.getItem("locationEnabled") === "true") {
      initializeLocationService();
    }
    // Ensure feature badges render at least once on startup
    updateFeatureStatus();

    // Check if API keys are missing and auto-open the API keys tab if needed
    // Add a delay so users can see the chat interface before the API key menu appears
    setTimeout(() => {
      openApiKeysTabIfNeeded();
    }, 2000);

    if (window.VERBOSE_LOGGING) {
      console.info("Chatbot application initialization complete.");
    }

    // Mark body as loaded to show the interface
    document.body.classList.add("loaded");

  } catch (error) {
    console.error("Initialization error:", error);
    // Still show the interface even if there's an error
    document.body.classList.add("loaded");
  }
}

/**
 * Setup scroll tracking for auto-scroll functionality
 */
function setupScrollTracking() {
  elements.chatBox.addEventListener("scroll", () => {
    const wasAtBottom = elements.chatBox.scrollHeight - elements.chatBox.clientHeight - elements.chatBox.scrollTop < 20;
    state.shouldAutoScroll = wasAtBottom;
  });
}

/**
 * Focus user input safely (handles mobile devices via mobileHandling.js)
 */
function focusInputField() {
  focusUserInputSafely();
}

/**
 * Initialize textarea height to prevent changing height when typing starts
 */
function initializeTextareaHeight() {
  if (elements.userInput) {
    // Set initial height to the default value from CSS
    elements.userInput.style.height = "56px";
  }
}

