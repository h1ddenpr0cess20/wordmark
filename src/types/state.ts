// Shared interfaces for the central app state and cached DOM element references.

import type { Message } from "./api.ts";
import type { GeneratedImage } from "./common.ts";
import type { PendingDocument, PendingUpload } from "./attachments.ts";

export interface AppState {
  conversationHistory: Message[];
  activeAbortController: AbortController | null;
  hljsLoaded: boolean;
  shouldStopGeneration: boolean;
  shouldAutoScroll: boolean;
  isResponsePending: boolean;
  activeLoadingMessageId: string | null;

  currentConversationId: string | null;
  currentConversationName: string | null;
  generatedImages: GeneratedImage[];
  currentGeneratedImageHtml: string[];
  loadedSystemPrompt: any;
  currentReasoningEffort: string;
  currentVerbosity: string;
  historyTokenBudget?: number;
  imageDataCache: Map<string, string>;

  pendingUploads: PendingUpload[];
  pendingDocuments: PendingDocument[];

  userThinkingState: Record<string, any>;
  messageImages: Record<string, any>;

  galleryImages: GeneratedImage[];
  galleryImagesLoaded: boolean;
  galleryInitialized: boolean;
  currentGalleryTab: string;

  isSlideshowOpen: boolean;

  activeVectorStore: string | null;

  debug: boolean;
  verboseLogging: boolean;
  shortResponseGuideline: string;
}

export interface Elements {
  chatBox: HTMLElement | null;
  userInput: HTMLTextAreaElement | null;
  sendButton: HTMLButtonElement | null;
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
}
