/**
 * Centralized application state and DOM element references.
 *
 * Modules should `import { state, elements } from "../init/state.ts"` and read
 * or write properties on these objects. This is the authoritative store for
 * shared runtime state and DOM references.
 */

import type { AppState, Elements } from "../../types/state.ts";

/** Authoritative store for shared, mutable runtime state. */
export const state: AppState = {
  conversationHistory: [],
  activeAbortController: null,
  hljsLoaded: false,
  shouldStopGeneration: false,
  shouldAutoScroll: true,
  isResponsePending: false,
  activeLoadingMessageId: null,

  currentConversationId: null,
  currentConversationName: null,
  generatedImages: [],
  currentGeneratedImageHtml: [],
  loadedSystemPrompt: null,
  currentReasoningEffort: "medium",
  currentVerbosity: "medium",
  imageDataCache: new Map(),

  pendingUploads: [],
  pendingDocuments: [],

  userThinkingState: {},

  messageImages: {},

  galleryImages: [],
  galleryImagesLoaded: false,
  galleryInitialized: false,
  currentGalleryTab: "generated",

  isSlideshowOpen: false,

  activeVectorStore: null,

  debug: false,
  verboseLogging: false,
  shortResponseGuideline: "",
};

/** Cached DOM element references, populated by `dom.ts` after panels load. */
export const elements: Elements = {
  chatBox: null,
  userInput: null,
  sendButton: null,
  settingsButton: null,
  settingsPanel: null,
  closeSettingsButton: null,

  modelSelector: null,
  serviceSelector: null,
  reasoningEffortSelector: null,
  verbositySelector: null,
  historyTokenBudgetInput: null,

  personalityPromptRadio: null,
  personalityInput: null,
  customPromptRadio: null,
  systemPromptCustom: null,
  noPromptRadio: null,

  clearMemoryButton: null,
  exportChatButton: null,
  exportFormatSelector: null,
  resetPersonalityButton: null,
  setPersonalityButton: null,
  setCustomPromptButton: null,
  setNoPromptButton: null,
  verboseModeToggle: null,
  dataSettingsToggle: null,

  ttsToggle: null,
  ttsAutoplayToggle: null,
  ttsProviderSelector: null,
  ttsVoiceSelector: null,
  ttsInstructionsInput: null,
  testTtsButton: null,
  stopTtsButton: null,
  clearTtsCacheButton: null,

  locationToggle: null,
  locationStatus: null,

  toolCallingToggle: null,
  individualToolsContainer: null,

  historyButton: null,
  historyPanel: null,
  closeHistoryButton: null,
  historyList: null,

  galleryButton: null,
  galleryPanel: null,
  closeGalleryButton: null,
  galleryGrid: null,
};
