// Shared interfaces for the central app state and cached DOM element references.
// Collections are intentionally loose (`any`) during the initial conversion;
// these can be tightened in a follow-up once stricter flags are enabled.

export interface AppState {
  conversationHistory: any[];
  activeAbortController: AbortController | null;
  hljsLoaded: boolean;
  shouldStopGeneration: boolean;
  shouldAutoScroll: boolean;
  isResponsePending: boolean;
  activeLoadingMessageId: string | null;

  currentConversationId: string | null;
  currentConversationName: string | null;
  generatedImages: any[];
  currentGeneratedImageHtml: any[];
  loadedSystemPrompt: any;
  currentReasoningEffort: string;
  currentVerbosity: string;
  imageDataCache: Map<string, any>;

  pendingUploads: any[];
  pendingDocuments: any[];

  userThinkingState: Record<string, any>;
  messageImages: Record<string, any>;

  galleryImages: any[];
  galleryImagesLoaded: boolean;
  galleryInitialized: boolean;
  currentGalleryTab: string;

  isSlideshowOpen: boolean;

  activeVectorStore: string | null;

  debug: boolean;
  verboseLogging: boolean;
  shortResponseGuideline: string;

  // Allow runtime-added properties without widening every access site.
  [key: string]: any;
}

export interface Elements {
  chatBox: HTMLElement | null;
  userInput: HTMLTextAreaElement | null;
  sendButton: HTMLButtonElement | null;
  sendButtonIcon: HTMLElement | null;
  settingsButton: HTMLButtonElement | null;
  settingsPanel: HTMLElement | null;
  closeSettingsButton: HTMLButtonElement | null;

  modelSelector: HTMLSelectElement | null;
  serviceSelector: HTMLSelectElement | null;
  reasoningEffortSelector: HTMLSelectElement | null;
  verbositySelector: HTMLSelectElement | null;
  historyTokenBudgetInput: HTMLInputElement | null;

  personalityPromptRadio: HTMLInputElement | null;
  personalityInput: HTMLInputElement | null;
  customPromptRadio: HTMLInputElement | null;
  systemPromptCustom: HTMLTextAreaElement | null;
  noPromptRadio: HTMLInputElement | null;

  clearMemoryButton: HTMLButtonElement | null;
  exportChatButton: HTMLButtonElement | null;
  exportFormatSelector: HTMLSelectElement | null;
  resetPersonalityButton: HTMLButtonElement | null;
  setPersonalityButton: HTMLButtonElement | null;
  setCustomPromptButton: HTMLButtonElement | null;
  setNoPromptButton: HTMLButtonElement | null;
  verboseModeToggle: HTMLInputElement | null;
  dataSettingsToggle: HTMLInputElement | null;

  ttsToggle: HTMLInputElement | null;
  ttsAutoplayToggle: HTMLInputElement | null;
  ttsProviderSelector: HTMLSelectElement | null;
  ttsVoiceSelector: HTMLSelectElement | null;
  ttsInstructionsInput: HTMLTextAreaElement | null;
  testTtsButton: HTMLButtonElement | null;
  stopTtsButton: HTMLButtonElement | null;
  clearTtsCacheButton: HTMLButtonElement | null;

  locationToggle: HTMLInputElement | null;
  locationStatus: HTMLElement | null;

  toolCallingToggle: HTMLInputElement | null;
  individualToolsContainer: HTMLElement | null;

  historyButton: HTMLButtonElement | null;
  historyPanel: HTMLElement | null;
  closeHistoryButton: HTMLButtonElement | null;
  historyList: HTMLElement | null;

  galleryButton: HTMLButtonElement | null;
  galleryPanel: HTMLElement | null;
  closeGalleryButton: HTMLButtonElement | null;
  galleryGrid: HTMLElement | null;

  // dom.js / other modules attach additional refs at runtime.
  [key: string]: HTMLElement | null;
}
