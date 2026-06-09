/**
 * DOM initialization for chatbot application
 */

import { elements, state } from "./state.ts";

// Typed element lookups: the concrete element type is asserted per call site to
// match the field declared on the `Elements` interface (state.ts), since the DOM
// APIs only return the broad `HTMLElement` / `Element` types.
const byId = <T extends HTMLElement = HTMLElement>(id: string): T | null =>
  document.getElementById(id) as T | null;
const bySel = <T extends Element = HTMLElement>(sel: string): T | null =>
  document.querySelector(sel) as T | null;

/**
 * Initialize all DOM references
 */
export function initializeDOMReferences() {
  elements.chatBox = byId("chat-box");
  elements.userInput = byId<HTMLTextAreaElement>("user-input");
  elements.sendButton = byId<HTMLButtonElement>("send-button");
  elements.settingsButton = byId<HTMLButtonElement>("settings-button");
  elements.settingsPanel = byId("settings-panel");
  elements.closeSettingsButton = bySel<HTMLButtonElement>(".close-settings");
  elements.modelSelector = byId<HTMLSelectElement>("model-selector");
  elements.serviceSelector = byId<HTMLSelectElement>("service-selector");
  elements.reasoningEffortSelector = byId<HTMLSelectElement>("reasoning-effort");
  elements.verbositySelector = byId<HTMLSelectElement>("verbosity-level");
  elements.historyTokenBudgetInput = byId<HTMLInputElement>("history-token-budget");
  elements.personalityPromptRadio = byId<HTMLInputElement>("personality-prompt");
  elements.customPromptRadio = byId<HTMLInputElement>("custom-prompt");
  elements.noPromptRadio = byId<HTMLInputElement>("no-prompt");
  elements.personalityInput = byId<HTMLInputElement>("personality-input");
  elements.systemPromptCustom = byId<HTMLTextAreaElement>("system-prompt-custom");
  elements.clearMemoryButton = byId<HTMLButtonElement>("clear-memory");
  elements.exportChatButton = byId<HTMLButtonElement>("export-chat");
  elements.exportFormatSelector = byId<HTMLSelectElement>("export-format");
  elements.resetPersonalityButton = byId<HTMLButtonElement>("reset-personality");
  elements.setPersonalityButton = byId<HTMLButtonElement>("set-personality");
  elements.setCustomPromptButton = byId<HTMLButtonElement>("set-custom-prompt");
  elements.setNoPromptButton = byId<HTMLButtonElement>("set-no-prompt");
  // Personality settings toggles
  elements.verboseModeToggle = byId<HTMLInputElement>("verbose-mode-toggle");
  // TTS elements
  elements.ttsToggle = byId<HTMLInputElement>("tts-toggle");
  elements.ttsAutoplayToggle = byId<HTMLInputElement>("tts-autoplay-toggle");
  elements.ttsProviderSelector = byId<HTMLSelectElement>("tts-provider-selector");
  elements.ttsVoiceSelector = byId<HTMLSelectElement>("tts-voice-selector");
  elements.ttsInstructionsInput = byId<HTMLTextAreaElement>("tts-instructions");
  elements.testTtsButton = byId<HTMLButtonElement>("test-tts");
  elements.stopTtsButton = byId<HTMLButtonElement>("stop-tts");
  elements.clearTtsCacheButton = byId<HTMLButtonElement>("clear-tts-cache");

  // Location elements
  elements.locationToggle = byId<HTMLInputElement>("location-toggle");
  elements.locationStatus = byId("location-status");

  // Tool calling toggle element
  elements.toolCallingToggle = byId<HTMLInputElement>("tool-calling-toggle");
  elements.dataSettingsToggle = byId<HTMLInputElement>("data-settings-toggle");

  // Individual tools container
  elements.individualToolsContainer = byId("individual-tools-container");

  // Chat history elements
  elements.historyButton = byId<HTMLButtonElement>("history-button");
  elements.historyPanel = byId("history-panel");
  elements.closeHistoryButton = bySel<HTMLButtonElement>(".close-history");
  elements.historyList = byId("history-list");

  // Gallery elements
  elements.galleryButton = byId<HTMLButtonElement>("gallery-button");
  elements.galleryPanel = byId("gallery-panel");
  elements.closeGalleryButton = bySel<HTMLButtonElement>(".close-gallery");
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
