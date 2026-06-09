/**
 * Centralized application state and DOM element references.
 *
 * Modules should `import { state, elements } from "../init/state.js"` and read
 * or write properties on these objects. This is the authoritative store for
 * shared runtime state and DOM references.
 */

import type { AppState, Elements } from "../../types/state.js";

// Mutable runtime state.
export const state: AppState = {
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

  // Pending attachment uploads (cleared after a message is sent)
  pendingUploads: [],
  pendingDocuments: [],

  // Per-message thinking/reasoning toggle state, keyed by message id
  userThinkingState: {},

  // Generated images rendered into messages, keyed by message id
  messageImages: {},

  // Gallery panel state
  galleryImages: [],
  galleryImagesLoaded: false,
  galleryInitialized: false,
  currentGalleryTab: "generated",

  // Image slideshow / lightbox open flag
  isSlideshowOpen: false,

  // Active vector store id for file-search (in-memory; not persisted here)
  activeVectorStore: null,

  // Runtime logging flags (toggled at runtime; initial defaults here, the
  // short-response guideline default text is seeded by config.js at load).
  debug: false,
  verboseLogging: false,
  shortResponseGuideline: "",
};

// DOM element references — populated by dom.js after panels load.
export const elements: Elements = {
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
  historyTokenBudgetInput: null,

  // Prompt configuration elements
  personalityPromptRadio: null,
  personalityInput: null,
  customPromptRadio: null,
  systemPromptCustom: null,
  noPromptRadio: null,

  // Action buttons
  clearMemoryButton: null,
  exportChatButton: null,
  exportFormatSelector: null,
  resetPersonalityButton: null,
  setPersonalityButton: null,
  setCustomPromptButton: null,
  setNoPromptButton: null,
  verboseModeToggle: null,
  dataSettingsToggle: null,

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
