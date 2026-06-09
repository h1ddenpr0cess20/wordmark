/**
 * DOM initialization for chatbot application
 */

import { elements, state } from "./state.js";

// Element lookups are cast through `any` because the concrete element types are
// declared on the `Elements` interface (state.ts); the DOM APIs only return the
// broad `HTMLElement | Element` types.
const byId = (id: string): any => document.getElementById(id) as any;
const bySel = (sel: string): any => document.querySelector(sel) as any;

/**
 * Initialize all DOM references
 */
export function initializeDOMReferences() {
  elements.chatBox = byId("chat-box");
  elements.userInput = byId("user-input");
  elements.sendButton = byId("send-button");
  elements.sendButtonIcon = elements.sendButton ? {
    send: elements.sendButton.querySelector(".send-icon"),
    stop: elements.sendButton.querySelector(".stop-icon"),
    spinner: elements.sendButton.querySelector(".stopping-spinner"),
  } as any : null;
  elements.settingsButton = byId("settings-button");
  elements.settingsPanel = byId("settings-panel");
  elements.closeSettingsButton = bySel(".close-settings");
  elements.modelSelector = byId("model-selector");
  elements.serviceSelector = byId("service-selector");
  elements.reasoningEffortSelector = byId("reasoning-effort");
  elements.verbositySelector = byId("verbosity-level");
  elements.historyTokenBudgetInput = byId("history-token-budget");
  elements.personalityPromptRadio = byId("personality-prompt");
  elements.customPromptRadio = byId("custom-prompt");
  elements.noPromptRadio = byId("no-prompt");
  elements.personalityInput = byId("personality-input");
  elements.systemPromptCustom = byId("system-prompt-custom");
  elements.clearMemoryButton = byId("clear-memory");
  elements.exportChatButton = byId("export-chat");
  elements.exportFormatSelector = byId("export-format");
  elements.resetPersonalityButton = byId("reset-personality");
  elements.setPersonalityButton = byId("set-personality");
  elements.setCustomPromptButton = byId("set-custom-prompt");
  elements.setNoPromptButton = byId("set-no-prompt");
  // Personality settings toggles
  elements.verboseModeToggle = byId("verbose-mode-toggle");
  // TTS elements
  elements.ttsToggle = byId("tts-toggle");
  elements.ttsAutoplayToggle = byId("tts-autoplay-toggle");
  elements.ttsProviderSelector = byId("tts-provider-selector");
  elements.ttsVoiceSelector = byId("tts-voice-selector");
  elements.ttsInstructionsInput = byId("tts-instructions");
  elements.testTtsButton = byId("test-tts");
  elements.stopTtsButton = byId("stop-tts");
  elements.clearTtsCacheButton = byId("clear-tts-cache");

  // Location elements
  elements.locationToggle = byId("location-toggle");
  elements.locationStatus = byId("location-status");

  // Tool calling toggle element
  elements.toolCallingToggle = byId("tool-calling-toggle");
  elements.dataSettingsToggle = byId("data-settings-toggle");

  // Individual tools container
  elements.individualToolsContainer = byId("individual-tools-container");

  // Chat history elements
  elements.historyButton = byId("history-button");
  elements.historyPanel = byId("history-panel");
  elements.closeHistoryButton = bySel(".close-history");
  elements.historyList = byId("history-list");

  // Gallery elements
  elements.galleryButton = byId("gallery-button");
  elements.galleryPanel = byId("gallery-panel");
  elements.closeGalleryButton = bySel(".close-gallery");
  elements.galleryGrid = byId("gallery-grid");

  if (state.verboseLogging) {
    console.info("DOM references assigned:", {
      chatBox: Boolean(elements.chatBox),
      userInput: Boolean(elements.userInput),
      sendButton: Boolean(elements.sendButton),
      modelSelector: Boolean(elements.modelSelector),
      serviceSelector: Boolean(elements.serviceSelector),
      reasoningEffortSelector: Boolean(elements.reasoningEffortSelector),
      verbositySelector: Boolean(elements.verbositySelector),
    // ...add more if needed
    });
  }
}
