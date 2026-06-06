/**
 * Centralized application state and DOM element references.
 *
 * Modules should `import { state, elements } from "../init/state.js"` and read
 * or write properties on these objects. During the window-globals migration a
 * compatibility bridge in globals.js mirrors every key onto `window.*`, so code
 * that has not been converted yet keeps working against the same storage.
 */

// Mutable runtime state.
export const state = {
  conversationHistory: [],
  activeAbortController: null,
  hljsLoaded: false,
  shouldStopGeneration: false,
  shouldAutoScroll: true,
  isResponsePending: false,
  activeLoadingMessageId: null,

  // Chat history / conversation tracking
  currentConversationId: null,
  currentConversationName: null,
  generatedImages: [],
  currentGeneratedImageHtml: [],
  loadedSystemPrompt: null,
  currentReasoningEffort: "medium",
  currentVerbosity: "medium",
  imageDataCache: new Map(),
};

// DOM element references — populated by dom.js after panels load.
export const elements = {
  // Main UI elements
  chatBox: null,
  userInput: null,
  sendButton: null,
  sendButtonIcon: null,
  settingsButton: null,
  settingsPanel: null,
  closeSettingsButton: null,

  // Model and service controls
  modelSelector: null,
  serviceSelector: null,
  reasoningEffortSelector: null,
  verbositySelector: null,

  // Prompt configuration elements
  personalityPromptRadio: null,
  personalityInput: null,
  customPromptRadio: null,
  systemPromptCustom: null,
  noPromptRadio: null,

  // Action buttons
  clearMemoryButton: null,
  exportChatButton: null,
  resetPersonalityButton: null,
  setPersonalityButton: null,
  setCustomPromptButton: null,
  setNoPromptButton: null,

  // TTS-related references
  ttsToggle: null,
  ttsAutoplayToggle: null,
  ttsProviderSelector: null,
  ttsVoiceSelector: null,
  ttsInstructionsInput: null,
  testTtsButton: null,
  stopTtsButton: null,
  clearTtsCacheButton: null,

  // Location-related references
  locationToggle: null,
  locationStatus: null,

  // Tool calling toggle reference
  toolCallingToggle: null,
  individualToolsContainer: null,

  // Chat history references
  historyButton: null,
  historyPanel: null,
  closeHistoryButton: null,
  historyList: null,

  // Gallery references
  galleryButton: null,
  galleryPanel: null,
  closeGalleryButton: null,
  galleryGrid: null,
};
