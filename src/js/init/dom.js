/**
 * DOM initialization for chatbot application
 */

import { elements, state } from "./state.js";
/**
 * Initialize all DOM references
 */
export function initializeDOMReferences() {
  elements.chatBox = document.getElementById("chat-box");
  elements.userInput = document.getElementById("user-input");
  elements.sendButton = document.getElementById("send-button");
  elements.sendButtonIcon = elements.sendButton ? {
    send: elements.sendButton.querySelector(".send-icon"),
    stop: elements.sendButton.querySelector(".stop-icon"),
    spinner: elements.sendButton.querySelector(".stopping-spinner"),
  } : null;
  elements.settingsButton = document.getElementById("settings-button");
  elements.settingsPanel = document.getElementById("settings-panel");
  elements.closeSettingsButton = document.querySelector(".close-settings");
  elements.modelSelector = document.getElementById("model-selector");
  elements.serviceSelector = document.getElementById("service-selector");
  elements.reasoningEffortSelector = document.getElementById("reasoning-effort");
  elements.verbositySelector = document.getElementById("verbosity-level");
  elements.personalityPromptRadio = document.getElementById("personality-prompt");
  elements.customPromptRadio = document.getElementById("custom-prompt");
  elements.noPromptRadio = document.getElementById("no-prompt");
  elements.personalityInput = document.getElementById("personality-input");
  elements.systemPromptCustom = document.getElementById("system-prompt-custom");
  elements.clearMemoryButton = document.getElementById("clear-memory");
  elements.exportChatButton = document.getElementById("export-chat");
  elements.exportFormatSelector = document.getElementById("export-format");
  elements.resetPersonalityButton = document.getElementById("reset-personality");
  elements.setPersonalityButton = document.getElementById("set-personality");
  elements.setCustomPromptButton = document.getElementById("set-custom-prompt");
  elements.setNoPromptButton = document.getElementById("set-no-prompt");
  // Personality settings toggles
  elements.verboseModeToggle = document.getElementById("verbose-mode-toggle");
  // TTS elements
  elements.ttsToggle = document.getElementById("tts-toggle");
  elements.ttsAutoplayToggle = document.getElementById("tts-autoplay-toggle");
  elements.ttsProviderSelector = document.getElementById("tts-provider-selector");
  elements.ttsVoiceSelector = document.getElementById("tts-voice-selector");
  elements.ttsInstructionsInput = document.getElementById("tts-instructions");
  elements.testTtsButton = document.getElementById("test-tts");
  elements.stopTtsButton = document.getElementById("stop-tts");
  elements.clearTtsCacheButton = document.getElementById("clear-tts-cache");

  // Location elements
  elements.locationToggle = document.getElementById("location-toggle");
  elements.locationStatus = document.getElementById("location-status");

  // Tool calling toggle element
  elements.toolCallingToggle = document.getElementById("tool-calling-toggle");
  elements.dataSettingsToggle = document.getElementById("data-settings-toggle");

  // Individual tools container
  elements.individualToolsContainer = document.getElementById("individual-tools-container");

  // Chat history elements
  elements.historyButton = document.getElementById("history-button");
  elements.historyPanel = document.getElementById("history-panel");
  elements.closeHistoryButton = document.querySelector(".close-history");
  elements.historyList = document.getElementById("history-list");

  // Gallery elements
  elements.galleryButton = document.getElementById("gallery-button");
  elements.galleryPanel = document.getElementById("gallery-panel");
  elements.closeGalleryButton = document.querySelector(".close-gallery");
  elements.galleryGrid = document.getElementById("gallery-grid");

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
